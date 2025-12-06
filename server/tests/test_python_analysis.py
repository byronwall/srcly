from app.services.python.python_analysis import PythonTreeSitterAnalyzer

PYTHON_CODE = """
import os
from typing import List

class MyClass:
    def __init__(self):
        self.value = 0
    
    def increment(self, amount: int) -> int:
        if amount > 0:
            self.value += amount
        return self.value

def independent_function(x):
    try:
        if x > 10:
            return x * 2
    except Exception:
        pass
    return x

# Control block scopes
if __name__ == "__main__":
    obj = MyClass()
    for i in range(5):
        obj.increment(i)

lambda_func = lambda x: x + 1
"""

def test_python_analysis_basics(tmp_path):
    f = tmp_path / "test.py"
    f.write_text(PYTHON_CODE, encoding="utf-8")
    
    analyzer = PythonTreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    assert metrics.nloc > 0
    assert metrics.python_import_count == 2 # import os, from typing ...
    
    # Check classes
    assert metrics.classes_count == 1
    
    # Check scopes
    # Expected top-level scopes:
    # - MyClass (class)
    # - independent_function (function)
    # - if (control block)
    # - lambda (lambda)
    
    # We might have nested scopes inside those.
    
    # Flatten function_list to find names? Or walk safely?
    # root children:
    top_level_names = [f.name for f in metrics.function_list]
    assert "(class) MyClass" in top_level_names
    assert "independent_function" in top_level_names
    assert "(if)" in top_level_names
    assert "(lambda)" in top_level_names
    
    # Check MyClass children
    my_class = next(f for f in metrics.function_list if f.name == "(class) MyClass")
    class_children_names = [c.name for c in my_class.children]
    assert "increment" in class_children_names
    assert "__init__" in class_children_names
    
    # Check increment complexity
    # 1 (base) + 1 (if) = 2?
    # Wait, our complexity logic counts "if" as +1 complexity for the PARENT. 
    # But we also create a scope for "if". 
    # If we create a scope for "if", does the "if" scope count usage inside it?
    increment = next(c for c in my_class.children if c.name == "increment")
    # Complexity of 'increment' should count the 'if' statement presence.
    # It should not recurse into the 'if' body for further complexity (unless we decide otherwise).
    # Based on implementation:
    # It counts `if_statement` as +1.
    # It stops traversal at `if_statement` because it's in `scope_boundary_types`.
    # So `increment` complexity = 1 (base) + 1 (if) = 2.
    assert increment.cyclomatic_complexity == 2
    
    # Check independent_function
    # def independent_function(x):
    #     try: ...
    # complexity: 1 (base) + 1 (try) = 2.
    # Inside try: if ...
    # The 'try' is a new scope.
    indep = next(f for f in metrics.function_list if f.name == "independent_function")
    assert indep.cyclomatic_complexity == 2
    
    # Check try scope complexity
    # Inside try, we have `if`.
    # The 'try' scope is unnamed or "(try)"?
    # Let's find "(try)" inside indep children
    try_scope = next(c for c in indep.children if c.name == "(try)")
    # Complexity of try scope: 1 (base) + 1 (if) + 1 (except) = 3.
    assert try_scope.cyclomatic_complexity == 3
    
    # Inside "if" scope logic? 
    # if x > 10: return x * 2
    # Complexity: 1 (base). No nested complexity.
    if_scope = next(c for c in try_scope.children if c.name == "(if)")
    assert if_scope.cyclomatic_complexity == 1


def test_python_control_blocks(tmp_path):
    code = """
def foo():
    for i in range(10):
        if i % 2 == 0:
            print(i)
    """
    f = tmp_path / "control.py"
    f.write_text(code, encoding="utf-8")
    
    analyzer = PythonTreeSitterAnalyzer()
    metrics = analyzer.analyze_file(str(f))
    
    foo = metrics.function_list[0]
    assert foo.name == "foo"
    
    # foo has 1 child: (for)
    assert len(foo.children) == 1
    for_scope = foo.children[0]
    assert for_scope.name == "(for)"
    
    # (for) has 1 child: (if)
    assert len(for_scope.children) == 1
    if_scope = for_scope.children[0]
    assert if_scope.name == "(if)"
    
