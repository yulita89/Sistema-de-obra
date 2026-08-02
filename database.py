import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Por defecto usa un archivo SQLite local (cero configuración).
# Para producción, define la variable de entorno DATABASE_URL, por ejemplo:
#   postgresql://usuario:password@localhost:5432/sistema_obra
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sistema_obra.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Entrega una sesión de base de datos a cada request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
