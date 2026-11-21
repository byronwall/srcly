import sqlite3

from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/items")
def create_item(name: str, price: float) -> dict[str, object]:
    label = name.strip()
    connection = sqlite3.connect("items.db")
    connection.execute("insert into items values (?, ?)", (label, price))
    print(label)
    return {"name": label, "price": price}
