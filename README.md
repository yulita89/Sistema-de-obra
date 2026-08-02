# Sistema de Obra — Backend (Python + SQL)

Backend en **FastAPI** con base de datos SQL usando **SQLAlchemy**.
Por defecto usa **SQLite** (un solo archivo, cero configuración) para que puedas
probarlo de inmediato. Cuando quieras pasar a producción, se cambia a
PostgreSQL con una sola variable de entorno.

## 1. Instalar dependencias

```bash
cd sistema-obra-backend
python3 -m venv venv
source venv/bin/activate        # En Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Correr el servidor

```bash
uvicorn app.main:app --reload
```

Esto crea automáticamente el archivo `sistema_obra.db` (SQLite) con todas las
tablas la primera vez que corres el servidor.

## 3. Probar la API

Abre en el navegador:

```
http://localhost:8000/docs
```

Ahí verás una interfaz interactiva (Swagger) donde puedes probar cada endpoint
sin escribir código: crear usuarios, agregar inventario, crear órdenes de
compra, etc.

## 4. Endpoints incluidos (sistema completo)

| Módulo              | Endpoints |
|----------------------|-----------|
| Usuarios             | `POST /usuarios/registro`, `POST /usuarios/login`, `GET /usuarios` |
| Inventario            | `GET/POST /inventario`, `PATCH /inventario/{id}/stock`, `DELETE /inventario/{id}` |
| Órdenes de compra     | `GET/POST /ordenes-compra`, `PATCH .../estado`, `DELETE ...` |
| Pedidos de materiales | `GET/POST /pedidos-materiales`, `PATCH .../estado`, `DELETE ...` |
| Trabajos              | `GET/POST /trabajos`, `PATCH .../estado`, `DELETE ...`, `POST/DELETE .../fotos` |
| Planos                | `GET/POST /planos`, `DELETE ...`, `POST/DELETE .../archivos` |
| Documentación contable| `GET/POST /documentos-contables`, `DELETE ...`, `POST/DELETE .../archivos` |
| Comercial y Administración (unidades, operaciones, cuoteros, proveedores, cobranzas, RH, banco, fondos fijos) | `GET/POST /modulo/{nombre}`, `PATCH /modulo/{nombre}/{id}/estado`, `DELETE /modulo/{nombre}/{id}` |

**Todo el sistema ya está migrado a Python + SQL.** Ya no queda ningún
módulo usando `window.storage`.

Las fotos y archivos (PDF/imágenes) se guardan como archivos reales en la
carpeta `uploads/` (se crea sola al usar el sistema) y se sirven en
`http://localhost:8000/uploads/...`. Solo la ruta del archivo se guarda en
la base SQL, no el archivo en sí — así la base no se hincha con datos
binarios.

Los 8 sub-módulos de Comercial y Administración comparten una sola tabla
genérica (`modulo_items`) con una columna JSON para sus campos propios —
el equivalente en SQL al componente `<GenericModule>` que ya usaba el
frontend en React.

## 5. Pasar a PostgreSQL (cuando estés listo para producción)

1. Instala PostgreSQL y crea una base: `createdb sistema_obra`
2. Define la variable de entorno antes de correr el servidor:

```bash
export DATABASE_URL="postgresql://usuario:password@localhost:5432/sistema_obra"
pip install psycopg2-binary
uvicorn app.main:app --reload
```

No hay que cambiar nada más del código — SQLAlchemy se encarga de hablar
con Postgres igual que con SQLite.

## 6. Conectar con el frontend React

En el archivo `sistema-obra.jsx`, cada llamada a `window.storage.get(...)` o
`window.storage.set(...)` se reemplaza por un `fetch()` a esta API. Por
ejemplo, para el inventario:

```js
// Antes:
const data = await lt("sitework:inventory", { items: [] });

// Después:
const res = await fetch("http://localhost:8000/inventario");
const items = await res.json();
```

Si quieres, en el siguiente paso puedo ayudarte a ir reemplazando estas
llamadas módulo por módulo directamente en tu archivo `.jsx`.
