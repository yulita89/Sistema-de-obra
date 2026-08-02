from datetime import date
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


# ---------- USUARIOS ----------
class UsuarioCrear(BaseModel):
    nombre: str
    usuario: str
    password: str
    rol: str = "trabajador"


class UsuarioLogin(BaseModel):
    usuario: str
    password: str


class UsuarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    usuario: str
    rol: str
    activo: bool


# ---------- INVENTARIO ----------
class InventarioCrear(BaseModel):
    codigo: Optional[str] = None
    nombre: str
    categoria: Optional[str] = None
    unidad: str = "u"
    stock: float = 0
    minimo: float = 0


class InventarioAjusteStock(BaseModel):
    delta: float  # positivo suma, negativo resta


class InventarioSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    categoria: Optional[str]
    unidad: str
    stock: float
    minimo: float


# ---------- ÓRDENES DE COMPRA ----------
class OrdenCompraItemEntrada(BaseModel):
    nombre: str
    cantidad: float
    unidad: Optional[str] = None
    precio: float = 0


class OrdenCompraItemSalida(OrdenCompraItemEntrada):
    model_config = ConfigDict(from_attributes=True)
    id: int


class OrdenCompraCrear(BaseModel):
    proveedor: str
    obra: Optional[str] = None
    fecha: date
    moneda: str = "PYG"
    items: List[OrdenCompraItemEntrada] = []


class OrdenCompraEstado(BaseModel):
    estado: str


class OrdenCompraSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero: str
    proveedor: str
    obra: Optional[str]
    fecha: date
    estado: str
    moneda: str
    total: float
    items: List[OrdenCompraItemSalida] = []


# ---------- PEDIDOS DE MATERIALES ----------
class PedidoItemEntrada(BaseModel):
    nombre: str
    cantidad: float
    unidad: Optional[str] = None


class PedidoItemSalida(PedidoItemEntrada):
    model_config = ConfigDict(from_attributes=True)
    id: int


class PedidoCrear(BaseModel):
    obra: str
    solicitante: Optional[str] = None
    fecha: date
    items: List[PedidoItemEntrada] = []


class PedidoEstado(BaseModel):
    estado: str


class PedidoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero: str
    obra: str
    solicitante: Optional[str]
    fecha: date
    estado: str
    items: List[PedidoItemSalida] = []


# ---------- MÓDULOS GENÉRICOS (Comercial / Administración) ----------
class EstadoEntrada(BaseModel):
    estado: str


# ---------- DOCUMENTACIÓN CONTABLE ----------
class DocumentoContableCrear(BaseModel):
    nombre: str
    categoria: Optional[str] = None
    fecha: date
    notas: Optional[str] = None


class DocumentoContableArchivoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tipo: str
    url_archivo: str
    nombre_archivo: Optional[str]


class DocumentoContableSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero: str
    nombre: str
    categoria: Optional[str]
    fecha: date
    notas: Optional[str]
    archivos: List[DocumentoContableArchivoSalida] = []
class TrabajoCrear(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    responsable: Optional[str] = None
    fecha: date


class TrabajoEstado(BaseModel):
    estado: str


class TrabajoFotoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    url_archivo: str


class TrabajoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero: str
    titulo: str
    descripcion: Optional[str]
    responsable: Optional[str]
    fecha: date
    estado: str
    fotos: List[TrabajoFotoSalida] = []


# ---------- PLANOS ----------
class PlanoCrear(BaseModel):
    nombre: str
    categoria: Optional[str] = None
    version: Optional[str] = None
    fecha: date
    notas: Optional[str] = None


class PlanoArchivoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tipo: str
    url_archivo: str
    nombre_archivo: Optional[str]


class PlanoSalida(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    numero: str
    nombre: str
    categoria: Optional[str]
    version: Optional[str]
    fecha: date
    notas: Optional[str]
    archivos: List[PlanoArchivoSalida] = []
