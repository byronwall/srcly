import subprocess
import os
import uvicorn

def main():
    # Build client
    print("Building client...")
    client_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../client"))
    if os.path.exists(client_dir):
        try:
            subprocess.check_call(["pnpm", "install"], cwd=client_dir)
            subprocess.check_call(["pnpm", "build"], cwd=client_dir)
        except Exception as e:
            print(f"Error building client: {e}")
            # Continue anyway? Or exit?
            # For dev, maybe we want to continue if just server is needed, but goal is served client.
            # But if build fails, serving it will show old or nothing.
            pass
    
    # Run server
    print("Starting server...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
