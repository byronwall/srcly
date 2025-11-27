from tree_sitter import Language, Parser
import tree_sitter_typescript as tstypescript

TSX_LANGUAGE = Language(tstypescript.language_tsx())
parser = Parser(TSX_LANGUAGE)

tsx_content = """
const MyComponent = () => {
    return (
        <div className="container">
            <button onClick={() => setCount(count + 1)}>Click me</button>
        </div>
    );
}
"""

tree = parser.parse(bytes(tsx_content, "utf8"))

def print_tree(node, indent=0):
    print(f"{'  ' * indent}{node.type} (field: {node.grammar_name})")
    for child in node.children:
        print_tree(child, indent + 1)

# Find the jsx_attribute
cursor = tree.walk()
def find_attr(node):
    if node.type == 'jsx_attribute':
        print("Found jsx_attribute:")
        print_tree(node)
        
        # Check logic
        name_node = node.child_by_field_name('name')
        if name_node:
            print(f"Name node text: {name_node.text.decode('utf-8')}")
        
        value_node = node.child_by_field_name('value')
        if value_node:
            print(f"Value node type: {value_node.type}")
            for child in value_node.children:
                print(f"Value child: {child.type}")

    for child in node.children:
        find_attr(child)

find_attr(tree.root_node)
