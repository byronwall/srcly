
import sys
from pathlib import Path

# Add server directory to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from app.services.focus_overlay import compute_focus_overlay

def test_tooltip_snippets():
    # Create a temporary TSX file
    test_file = Path("temp_test_tooltip.tsx")
    content = """
import { createSignal } from "solid-js";

const myVar = 10;

function MyComponent() {
  console.log(myVar);
}
"""
    test_file.write_text(content.strip())
    
    try:
        response = compute_focus_overlay(
            file_path=str(test_file.absolute()),
            slice_start_line=1,
            slice_end_line=10,
            focus_start_line=1,
            focus_end_line=10
        )
        
        found_myVar = False
        found_import = False
        
        for token in response.tokens:
            print(f"Token: {token.symbolId}, Cat: {token.category}, Line: {token.fileLine}, DefLine: {token.definitionLine}, Snippet: '{token.definitionSnippet}'")
            if token.symbolId.endswith(":myVar") and token.category == "local": 
                # Usage of myVar
                print(f"MATCHED myVar -> Token: {token.symbolId}, Line: {token.fileLine}, Snippet: '{token.definitionSnippet}'")
                if token.definitionSnippet and "const myVar = 10" in token.definitionSnippet:
                    found_myVar = True
            
            # Check for import usage if we had one, but myVar usage is definitely local
            
        if found_myVar:
            print("SUCCESS: Found myVar definition snippet.")
        else:
            print("FAILURE: Did not find myVar definition snippet.")

    finally:
        if test_file.exists():
            test_file.unlink()

if __name__ == "__main__":
    test_tooltip_snippets()
