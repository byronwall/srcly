# FastAPI: path, query and body parameters, Depends chains, pydantic models, response_model, BackgroundTasks.
import logging

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, field_validator

app = FastAPI()
log = logging.getLogger(__name__)


class Item(BaseModel):
    name: str
    price: float

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class ItemOut(BaseModel):
    name: str


# F1 path parameter to the response
@app.get("/items/{item_id}")
def read_item(item_id: int) -> dict:  # @trace f-path-param forward symbol item_id @want http-response|return
    return {"id": item_id}


# F2 query parameter through Query()
@app.get("/search")
def search(q: str = Query(default="")) -> dict:  # @trace f-query-param forward symbol q @want http-response|return
    return {"q": q.lower()}


# F3 body model field to a log line
@app.post("/items")
def create_item(item: Item) -> ItemOut:  # @trace f-body-field forward symbol item @want external-effect
    log.info("created %s", item.name)
    return ItemOut(name=item.name)


# F4 response_model: the returned model is the response
@app.post("/items/echo", response_model=ItemOut)
def echo_item(item: Item):
    out = ItemOut(name=item.name)
    return out  # @trace f-response-model backward out @want request|parameter


# F5 Depends chain: a header read by a dependency reaches the handler
def get_token(authorization: str = Header()) -> str:
    return authorization.removeprefix("Bearer ")


def get_user(token: str = Depends(get_token)) -> str:
    return f"user:{token}"


@app.get("/me")
def me(user: str = Depends(get_user)) -> dict:
    return {"who": user}  # @trace f-depends-chain backward user @want request|parameter


# F6 HTTPException carries a parameter
@app.get("/fail/{code}")
def fail(code: int) -> None:  # @trace f-http-exception forward symbol code @want http-response
    raise HTTPException(status_code=400, detail=f"bad {code}")


# F7 BackgroundTasks hands a value to a task function
def write_audit(message: str) -> None:
    log.info(message)


@app.post("/audit")
def audit(note: str, tasks: BackgroundTasks) -> dict:  # @trace f-background-task forward symbol note @want external-effect|http-response
    tasks.add_task(write_audit, note)
    return {"ok": True}
