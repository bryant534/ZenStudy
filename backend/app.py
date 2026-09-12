from flask import Flask
from auth import auth
import os 
from dotenv import load_dotenv

load_dotenv()

app = Flask(
    __name__,
    template_folder="../Frontend/templates",
    static_folder="../Frontend/static"
)

# secret key
app.secret_key = "angela" 

app.register_blueprint(auth)


if __name__ == "__main__":
    app.run(
    host="0.0.0.0",
    port=8000,
    debug=True
)