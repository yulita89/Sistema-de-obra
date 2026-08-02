import os
import shutil
import uuid

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func

from . import models, schemas
from .database import engine, get_db
from .security import hash_password, verify_password

# Crea las tablas en la base de datos si todavía no existen
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sistema de Obra API")

# Carpeta donde se guardan las fotos y PDF subidos, servida en /uploads/...
# En Render (capa gratis) el disco es efímero: los archivos se BORRAN en
# cada redeploy o reinicio. Para producción real, o bien se paga un "disco
# persistente" en Render, o se sube UPLOAD_DIR apuntando a un disco montado,
# o se migra a un servicio de almacenamiento externo (ej. Cloudinary, S3).
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def guardar_archivo(archivo: UploadFile, subcarpeta: str) -> str:
    """Guarda un archivo subido en disco y devuelve la URL pública para acceder a él."""
    carpeta = os.path.join(UPLOAD_DIR, subcarpeta)
    os.makedirs(carpeta, exist_ok=True)
    extension = os.path.splitext(archivo.filename)[1]
    nombre_unico = f"{uuid.uuid4().hex}{extension}"
    ruta_destino = os.path.join(carpeta, nombre_unico)
    with open(ruta_destino, "wb") as f:
        shutil.copyfileobj(archivo.file, f)
    return f"/uploads/{subcarpeta}/{nombre_unico}"

# Permite que el frontend React llame a esta API. En desarrollo local
# aceptamos cualquier origen ("*"); en producción, definir la variable de
# entorno ALLOWED_ORIGIN con el dominio real del frontend (ej: Netlify)
# para no dejar la API abierta a cualquier sitio.
allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin] if allowed_origin != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def siguiente_numero(db: Session, modelo, prefijo: str) -> str:
    """Genera números tipo OC-0001, OT-0002, etc., igual que la app original."""
    total = db.query(func.count(modelo.id)).scalar() or 0
    return f"{prefijo}-{str(total + 1).zfill(4)}"


# =====================================================================
# USUARIOS / AUTENTICACIÓN
# =====================================================================
@app.post("/usuarios/registro", response_model=schemas.UsuarioSalida)
def registrar_usuario(datos: schemas.UsuarioCrear, db: Session = Depends(get_db)):
    existe = db.query(models.Usuario).filter(models.Usuario.usuario == datos.usuario).first()
    if existe:
        raise HTTPException(400, "Ese usuario ya existe.")
    primer_usuario = db.query(func.count(models.Usuario.id)).scalar() == 0
    nuevo = models.Usuario(
        nombre=datos.nombre,
        usuario=datos.usuario,
        password_hash=hash_password(datos.password),
        rol="admin" if primer_usuario else datos.rol,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@app.post("/usuarios/login", response_model=schemas.UsuarioSalida)
def login(datos: schemas.UsuarioLogin, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.usuario == datos.usuario).first()
    if not user or not verify_password(datos.password, user.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos.")
    if not user.activo:
        raise HTTPException(403, "Este usuario está deshabilitado.")
    return user


@app.get("/usuarios", response_model=list[schemas.UsuarioSalida])
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(models.Usuario).all()


# =====================================================================
# INVENTARIO
# =====================================================================
@app.get("/inventario", response_model=list[schemas.InventarioSalida])
def listar_inventario(db: Session = Depends(get_db)):
    return db.query(models.Inventario).all()


@app.post("/inventario", response_model=schemas.InventarioSalida)
def crear_item_inventario(item: schemas.InventarioCrear, db: Session = Depends(get_db)):
    codigo = item.codigo or siguiente_numero(db, models.Inventario, "INV")
    nuevo = models.Inventario(
        codigo=codigo, nombre=item.nombre, categoria=item.categoria,
        unidad=item.unidad, stock=item.stock, minimo=item.minimo,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@app.patch("/inventario/{item_id}/stock", response_model=schemas.InventarioSalida)
def ajustar_stock(item_id: int, ajuste: schemas.InventarioAjusteStock, db: Session = Depends(get_db)):
    item = db.query(models.Inventario).get(item_id)
    if not item:
        raise HTTPException(404, "Ítem no encontrado.")
    item.stock = max(0, float(item.stock) + ajuste.delta)
    db.commit()
    db.refresh(item)
    return item


@app.delete("/inventario/{item_id}")
def eliminar_item_inventario(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Inventario).get(item_id)
    if not item:
        raise HTTPException(404, "Ítem no encontrado.")
    db.delete(item)
    db.commit()
    return {"ok": True}


# =====================================================================
# ÓRDENES DE COMPRA
# =====================================================================
@app.get("/ordenes-compra", response_model=list[schemas.OrdenCompraSalida])
def listar_ordenes_compra(db: Session = Depends(get_db)):
    return db.query(models.OrdenCompra).all()


@app.post("/ordenes-compra", response_model=schemas.OrdenCompraSalida)
def crear_orden_compra(datos: schemas.OrdenCompraCrear, db: Session = Depends(get_db)):
    total = sum(i.cantidad * i.precio for i in datos.items)
    orden = models.OrdenCompra(
        numero=siguiente_numero(db, models.OrdenCompra, "OC"),
        proveedor=datos.proveedor, obra=datos.obra, fecha=datos.fecha,
        moneda=datos.moneda, total=total,
    )
    orden.items = [models.OrdenCompraItem(**i.model_dump()) for i in datos.items]
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return orden


@app.patch("/ordenes-compra/{orden_id}/estado", response_model=schemas.OrdenCompraSalida)
def cambiar_estado_orden_compra(orden_id: int, datos: schemas.OrdenCompraEstado, db: Session = Depends(get_db)):
    orden = db.query(models.OrdenCompra).get(orden_id)
    if not orden:
        raise HTTPException(404, "Orden no encontrada.")
    orden.estado = datos.estado
    db.commit()
    db.refresh(orden)
    return orden


@app.delete("/ordenes-compra/{orden_id}")
def eliminar_orden_compra(orden_id: int, db: Session = Depends(get_db)):
    orden = db.query(models.OrdenCompra).get(orden_id)
    if not orden:
        raise HTTPException(404, "Orden no encontrada.")
    db.delete(orden)
    db.commit()
    return {"ok": True}


# =====================================================================
# PEDIDOS DE MATERIALES
# =====================================================================
@app.get("/pedidos-materiales", response_model=list[schemas.PedidoSalida])
def listar_pedidos(db: Session = Depends(get_db)):
    return db.query(models.PedidoMaterial).all()


@app.post("/pedidos-materiales", response_model=schemas.PedidoSalida)
def crear_pedido(datos: schemas.PedidoCrear, db: Session = Depends(get_db)):
    pedido = models.PedidoMaterial(
        numero=siguiente_numero(db, models.PedidoMaterial, "OP"),
        obra=datos.obra, solicitante=datos.solicitante, fecha=datos.fecha,
    )
    pedido.items = [models.PedidoMaterialItem(**i.model_dump()) for i in datos.items]
    db.add(pedido)
    db.commit()
    db.refresh(pedido)
    return pedido


@app.patch("/pedidos-materiales/{pedido_id}/estado", response_model=schemas.PedidoSalida)
def cambiar_estado_pedido(pedido_id: int, datos: schemas.PedidoEstado, db: Session = Depends(get_db)):
    pedido = db.query(models.PedidoMaterial).get(pedido_id)
    if not pedido:
        raise HTTPException(404, "Pedido no encontrado.")
    pedido.estado = datos.estado
    db.commit()
    db.refresh(pedido)
    return pedido


@app.delete("/pedidos-materiales/{pedido_id}")
def eliminar_pedido(pedido_id: int, db: Session = Depends(get_db)):
    pedido = db.query(models.PedidoMaterial).get(pedido_id)
    if not pedido:
        raise HTTPException(404, "Pedido no encontrado.")
    db.delete(pedido)
    db.commit()
    return {"ok": True}


# =====================================================================
# TRABAJOS (órdenes de trabajo)
# =====================================================================
@app.get("/trabajos", response_model=list[schemas.TrabajoSalida])
def listar_trabajos(db: Session = Depends(get_db)):
    return db.query(models.Trabajo).all()


@app.post("/trabajos", response_model=schemas.TrabajoSalida)
def crear_trabajo(datos: schemas.TrabajoCrear, db: Session = Depends(get_db)):
    trabajo = models.Trabajo(
        numero=siguiente_numero(db, models.Trabajo, "OT"),
        titulo=datos.titulo, descripcion=datos.descripcion,
        responsable=datos.responsable, fecha=datos.fecha,
    )
    db.add(trabajo)
    db.commit()
    db.refresh(trabajo)
    return trabajo


@app.patch("/trabajos/{trabajo_id}/estado", response_model=schemas.TrabajoSalida)
def cambiar_estado_trabajo(trabajo_id: int, datos: schemas.TrabajoEstado, db: Session = Depends(get_db)):
    trabajo = db.query(models.Trabajo).get(trabajo_id)
    if not trabajo:
        raise HTTPException(404, "Trabajo no encontrado.")
    trabajo.estado = datos.estado
    db.commit()
    db.refresh(trabajo)
    return trabajo


@app.delete("/trabajos/{trabajo_id}")
def eliminar_trabajo(trabajo_id: int, db: Session = Depends(get_db)):
    trabajo = db.query(models.Trabajo).get(trabajo_id)
    if not trabajo:
        raise HTTPException(404, "Trabajo no encontrado.")
    db.delete(trabajo)
    db.commit()
    return {"ok": True}


@app.post("/trabajos/{trabajo_id}/fotos", response_model=schemas.TrabajoSalida)
def subir_fotos_trabajo(
    trabajo_id: int, archivos: list[UploadFile] = File(...), db: Session = Depends(get_db)
):
    trabajo = db.query(models.Trabajo).get(trabajo_id)
    if not trabajo:
        raise HTTPException(404, "Trabajo no encontrado.")
    for archivo in archivos:
        url = guardar_archivo(archivo, f"trabajos/{trabajo_id}")
        db.add(models.TrabajoFoto(trabajo_id=trabajo_id, url_archivo=url))
    db.commit()
    db.refresh(trabajo)
    return trabajo


@app.delete("/trabajos/{trabajo_id}/fotos/{foto_id}")
def eliminar_foto_trabajo(trabajo_id: int, foto_id: int, db: Session = Depends(get_db)):
    foto = db.query(models.TrabajoFoto).filter(
        models.TrabajoFoto.id == foto_id, models.TrabajoFoto.trabajo_id == trabajo_id
    ).first()
    if not foto:
        raise HTTPException(404, "Foto no encontrada.")
    db.delete(foto)
    db.commit()
    return {"ok": True}


# =====================================================================
# PLANOS
# =====================================================================
@app.get("/planos", response_model=list[schemas.PlanoSalida])
def listar_planos(db: Session = Depends(get_db)):
    return db.query(models.Plano).all()


@app.post("/planos", response_model=schemas.PlanoSalida)
def crear_plano(datos: schemas.PlanoCrear, db: Session = Depends(get_db)):
    plano = models.Plano(
        numero=siguiente_numero(db, models.Plano, "PL"),
        nombre=datos.nombre, categoria=datos.categoria,
        version=datos.version, fecha=datos.fecha, notas=datos.notas,
    )
    db.add(plano)
    db.commit()
    db.refresh(plano)
    return plano


@app.delete("/planos/{plano_id}")
def eliminar_plano(plano_id: int, db: Session = Depends(get_db)):
    plano = db.query(models.Plano).get(plano_id)
    if not plano:
        raise HTTPException(404, "Plano no encontrado.")
    db.delete(plano)
    db.commit()
    return {"ok": True}


@app.post("/planos/{plano_id}/archivos", response_model=schemas.PlanoSalida)
def subir_archivos_plano(
    plano_id: int, archivos: list[UploadFile] = File(...), db: Session = Depends(get_db)
):
    plano = db.query(models.Plano).get(plano_id)
    if not plano:
        raise HTTPException(404, "Plano no encontrado.")
    for archivo in archivos:
        tipo = "imagen" if (archivo.content_type or "").startswith("image/") else "pdf"
        url = guardar_archivo(archivo, f"planos/{plano_id}")
        db.add(models.PlanoArchivo(
            plano_id=plano_id, tipo=tipo, url_archivo=url, nombre_archivo=archivo.filename
        ))
    db.commit()
    db.refresh(plano)
    return plano


@app.delete("/planos/{plano_id}/archivos/{archivo_id}")
def eliminar_archivo_plano(plano_id: int, archivo_id: int, db: Session = Depends(get_db)):
    archivo = db.query(models.PlanoArchivo).filter(
        models.PlanoArchivo.id == archivo_id, models.PlanoArchivo.plano_id == plano_id
    ).first()
    if not archivo:
        raise HTTPException(404, "Archivo no encontrado.")
    db.delete(archivo)
    db.commit()
    return {"ok": True}


# =====================================================================
# DOCUMENTACIÓN CONTABLE
# =====================================================================
@app.get("/documentos-contables", response_model=list[schemas.DocumentoContableSalida])
def listar_documentos_contables(db: Session = Depends(get_db)):
    return db.query(models.DocumentoContable).all()


@app.post("/documentos-contables", response_model=schemas.DocumentoContableSalida)
def crear_documento_contable(datos: schemas.DocumentoContableCrear, db: Session = Depends(get_db)):
    doc = models.DocumentoContable(
        numero=siguiente_numero(db, models.DocumentoContable, "CT"),
        nombre=datos.nombre, categoria=datos.categoria, fecha=datos.fecha, notas=datos.notas,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@app.delete("/documentos-contables/{doc_id}")
def eliminar_documento_contable(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.DocumentoContable).get(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado.")
    db.delete(doc)
    db.commit()
    return {"ok": True}


@app.post("/documentos-contables/{doc_id}/archivos", response_model=schemas.DocumentoContableSalida)
def subir_archivos_documento(
    doc_id: int, archivos: list[UploadFile] = File(...), db: Session = Depends(get_db)
):
    doc = db.query(models.DocumentoContable).get(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado.")
    for archivo in archivos:
        tipo = "imagen" if (archivo.content_type or "").startswith("image/") else "pdf"
        url = guardar_archivo(archivo, f"contable/{doc_id}")
        db.add(models.DocumentoContableArchivo(
            documento_id=doc_id, tipo=tipo, url_archivo=url, nombre_archivo=archivo.filename
        ))
    db.commit()
    db.refresh(doc)
    return doc


@app.delete("/documentos-contables/{doc_id}/archivos/{archivo_id}")
def eliminar_archivo_documento(doc_id: int, archivo_id: int, db: Session = Depends(get_db)):
    archivo = db.query(models.DocumentoContableArchivo).filter(
        models.DocumentoContableArchivo.id == archivo_id,
        models.DocumentoContableArchivo.documento_id == doc_id,
    ).first()
    if not archivo:
        raise HTTPException(404, "Archivo no encontrado.")
    db.delete(archivo)
    db.commit()
    return {"ok": True}


# =====================================================================
# MÓDULOS GENÉRICOS (Comercial y Administración)
# unidades, operaciones-comerciales, cuoteros, proveedores, cobranzas,
# rh, banco, fondos-fijos — todos comparten esta misma tabla/endpoints,
# distinguidos por el parámetro {modulo} en la URL.
# =====================================================================
def _serializar_modulo_item(item: models.ModuloItem) -> dict:
    salida = {"id": item.id, "numero": item.numero}
    salida.update(item.datos or {})
    if item.estado is not None:
        salida["estado"] = item.estado
    return salida


@app.get("/modulo/{modulo}")
def listar_modulo(modulo: str, db: Session = Depends(get_db)):
    items = db.query(models.ModuloItem).filter(models.ModuloItem.modulo == modulo).all()
    return [_serializar_modulo_item(i) for i in items]


@app.post("/modulo/{modulo}")
def crear_item_modulo(modulo: str, payload: dict, db: Session = Depends(get_db)):
    payload = dict(payload)
    prefijo = payload.pop("_prefijo", modulo[:3].upper())
    estado_inicial = payload.pop("_estado_inicial", None)
    total = db.query(func.count(models.ModuloItem.id)).filter(models.ModuloItem.modulo == modulo).scalar() or 0
    nuevo = models.ModuloItem(
        modulo=modulo,
        numero=f"{prefijo}-{str(total + 1).zfill(4)}",
        estado=estado_inicial,
        datos=payload,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return _serializar_modulo_item(nuevo)


@app.patch("/modulo/{modulo}/{item_id}/estado")
def cambiar_estado_modulo(modulo: str, item_id: int, datos: schemas.EstadoEntrada, db: Session = Depends(get_db)):
    item = db.query(models.ModuloItem).filter(
        models.ModuloItem.modulo == modulo, models.ModuloItem.id == item_id
    ).first()
    if not item:
        raise HTTPException(404, "Registro no encontrado.")
    item.estado = datos.estado
    db.commit()
    db.refresh(item)
    return _serializar_modulo_item(item)


@app.delete("/modulo/{modulo}/{item_id}")
def eliminar_item_modulo(modulo: str, item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.ModuloItem).filter(
        models.ModuloItem.modulo == modulo, models.ModuloItem.id == item_id
    ).first()
    if not item:
        raise HTTPException(404, "Registro no encontrado.")
    db.delete(item)
    db.commit()
    return {"ok": True}


@app.get("/")
def raiz():
    return {"mensaje": "Sistema de Obra API funcionando. Ver /docs para probar todo."}
