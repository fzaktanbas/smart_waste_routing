from fastapi import FastAPI
from sqlalchemy import text

from database import engine  #Database bağlantısının motorunu oluşturuyor.

app = FastAPI()


@app.get("/")
def root():
    return {
        "message": "Smart Waste Routing API çalışıyor!"
    }


@app.get("/test-db")
def test_database():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        return {
            "database": "connected",
            "result": result.scalar()
        }