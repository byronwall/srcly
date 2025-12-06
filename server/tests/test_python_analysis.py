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
    # - lambda (lambda)
    # Note: "if __name__ == '__main__':" is at top level but is a control block, 
    # so it should NOT appear in function_list.
    
    top_level_names = [f.name for f in metrics.function_list]
    assert "(class) MyClass" in top_level_names
    assert "independent_function" in top_level_names
    assert "(lambda)" in top_level_names
    assert "(if)" not in top_level_names
    
    # Check MyClass children
    my_class = next(f for f in metrics.function_list if f.name == "(class) MyClass")
    class_children_names = [c.name for c in my_class.children]
    assert "increment" in class_children_names
    assert "__init__" in class_children_names
    
    # Check increment complexity
    increment = next(c for c in my_class.children if c.name == "increment")
    # Complexity: 1 (base) + 1 (if) = 2.
    assert increment.cyclomatic_complexity == 2
    
    # Check independent_function
    # def independent_function(x):
    #     try:
    #         if x > 10:
    #             return x * 2
    #     except Exception:
    #         pass
    #     return x
    # Complexity:
    # 1 (base)
    # + 0 (try - not a branch usually, but maybe we count it? 
    #      Our implementation does NOT count 'try' as complexity in complexity_node_types 
    #      (removed from list or kept? I kept it removed based on typical CC rules, but let's check code).
    #      Wait, in my edit I removed 'try_statement' from complexity_node_types but kept 'except_clause'.
    # + 1 (if)
    # + 1 (except)
    # Total = 3
    indep = next(f for f in metrics.function_list if f.name == "independent_function")
    assert indep.cyclomatic_complexity == 3
    
    # Verify no Scope children for try/if inside independent_function
    assert len(indep.children) == 0


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
    
    # foo should have NO children (scopes), because 'for' and 'if' are not scopes anymore
    assert len(foo.children) == 0
    
    # Complexity of foo:
    # 1 (base) + 1 (for) + 1 (if) = 3
    assert foo.cyclomatic_complexity == 3
    
