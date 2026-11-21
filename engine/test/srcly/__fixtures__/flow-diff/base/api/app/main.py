from fastapi import FastAPI

app = FastAPI()


@app.post("/items")
def create_item(name: str, price: float) -> dict[str, object]:
    label = name.strip()
    return {"name": label, "price": price}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
