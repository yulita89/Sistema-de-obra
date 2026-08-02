from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime, Numeric, Text, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    usuario = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)  # hash seguro (passlib/bcrypt)
    rol = Column(String(20), nullable=False, default="trabajador")
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(DateTime, server_default=func.now())


class Inventario(Base):
    __tablename__ = "inventario"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(30), unique=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    categoria = Column(String(80))
    unidad = Column(String(20), nullable=False, default="u")
    stock = Column(Numeric(12, 2), nullable=False, default=0)
    minimo = Column(Numeric(12, 2), nullable=False, default=0)


class OrdenCompra(Base):
    __tablename__ = "ordenes_compra"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), unique=True, nullable=False)
    proveedor = Column(String(150), nullable=False)
    obra = Column(String(150))
    fecha = Column(Date, nullable=False)
    estado = Column(String(20), nullable=False, default="Pendiente")
    moneda = Column(String(3), nullable=False, default="PYG")
    total = Column(Numeric(14, 2), nullable=False, default=0)

    items = relationship(
        "OrdenCompraItem", back_populates="orden", cascade="all, delete-orphan"
    )


class OrdenCompraItem(Base):
    __tablename__ = "ordenes_compra_items"

    id = Column(Integer, primary_key=True, index=True)
    orden_compra_id = Column(Integer, ForeignKey("ordenes_compra.id"), nullable=False)
    nombre = Column(String(150), nullable=False)
    cantidad = Column(Numeric(12, 2), nullable=False)
    unidad = Column(String(20))
    precio = Column(Numeric(14, 2), nullable=False, default=0)

    orden = relationship("OrdenCompra", back_populates="items")


class PedidoMaterial(Base):
    __tablename__ = "pedidos_materiales"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), unique=True, nullable=False)
    obra = Column(String(150), nullable=False)
    solicitante = Column(String(150))
    fecha = Column(Date, nullable=False)
    estado = Column(String(20), nullable=False, default="Solicitado")

    items = relationship(
        "PedidoMaterialItem", back_populates="pedido", cascade="all, delete-orphan"
    )


class PedidoMaterialItem(Base):
    __tablename__ = "pedidos_materiales_items"

    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos_materiales.id"), nullable=False)
    nombre = Column(String(150), nullable=False)
    cantidad = Column(Numeric(12, 2), nullable=False)
    unidad = Column(String(20))

    pedido = relationship("PedidoMaterial", back_populates="items")


class Trabajo(Base):
    __tablename__ = "trabajos"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), unique=True, nullable=False)
    titulo = Column(String(200), nullable=False)
    descripcion = Column(Text)
    responsable = Column(String(150))
    fecha = Column(Date, nullable=False)
    estado = Column(String(20), nullable=False, default="Pendiente")

    fotos = relationship(
        "TrabajoFoto", back_populates="trabajo", cascade="all, delete-orphan"
    )


class TrabajoFoto(Base):
    __tablename__ = "trabajos_fotos"

    id = Column(Integer, primary_key=True, index=True)
    trabajo_id = Column(Integer, ForeignKey("trabajos.id"), nullable=False)
    url_archivo = Column(Text, nullable=False)  # ej: /uploads/trabajos/3/foto1.jpg
    subida_en = Column(DateTime, server_default=func.now())

    trabajo = relationship("Trabajo", back_populates="fotos")


class Plano(Base):
    __tablename__ = "planos"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    categoria = Column(String(50))
    version = Column(String(30))
    fecha = Column(Date, nullable=False)
    notas = Column(Text)

    archivos = relationship(
        "PlanoArchivo", back_populates="plano", cascade="all, delete-orphan"
    )


class PlanoArchivo(Base):
    __tablename__ = "planos_archivos"

    id = Column(Integer, primary_key=True, index=True)
    plano_id = Column(Integer, ForeignKey("planos.id"), nullable=False)
    tipo = Column(String(10))  # "imagen" o "pdf"
    url_archivo = Column(Text, nullable=False)
    nombre_archivo = Column(String(200))

    plano = relationship("Plano", back_populates="archivos")


class DocumentoContable(Base):
    __tablename__ = "documentos_contables"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), unique=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    categoria = Column(String(30))
    fecha = Column(Date, nullable=False)
    notas = Column(Text)

    archivos = relationship(
        "DocumentoContableArchivo", back_populates="documento", cascade="all, delete-orphan"
    )


class DocumentoContableArchivo(Base):
    __tablename__ = "documentos_contables_archivos"

    id = Column(Integer, primary_key=True, index=True)
    documento_id = Column(Integer, ForeignKey("documentos_contables.id"), nullable=False)
    tipo = Column(String(10))
    url_archivo = Column(Text, nullable=False)
    nombre_archivo = Column(String(200))

    documento = relationship("DocumentoContable", back_populates="archivos")


class ModuloItem(Base):
    """
    Tabla genérica para los sub-módulos de Comercial y Administración
    (unidades, operaciones, cuoteros, proveedores, cobranzas, RH, banco,
    fondos fijos). Cada uno tiene campos distintos, así que en vez de crear
    8 tablas casi idénticas, se guarda 'modulo' (qué sub-módulo es) +
    'datos' (los campos propios de ese formulario) en una columna JSON.
    Es el equivalente en SQL al patrón que ya usa el componente
    <GenericModule> en React.
    """
    __tablename__ = "modulo_items"

    id = Column(Integer, primary_key=True, index=True)
    modulo = Column(String(50), nullable=False, index=True)  # ej: "proveedores", "cobranzas"
    numero = Column(String(20), nullable=False)
    estado = Column(String(30), nullable=True)
    datos = Column(JSON, nullable=False, default=dict)
    creado_en = Column(DateTime, server_default=func.now())
