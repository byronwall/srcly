import sys
import os
from pathlib import Path

# Add server directory to path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "server")))

from app.services import analysis

def main():
    print("Running verification...")
    root = Path(".")
    try:
        node = analysis.scan_codebase(root)
        print("Analysis complete.")
        print(f"Root node: {node.name}, Children: {len(node.children)}")
    except Exception as e:
        print(f"Verification failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
