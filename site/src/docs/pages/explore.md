# Explore a codebase

Srcly offers linked views of one scan: a treemap, a file explorer, Hot Spots, a 2×2 view, a code viewer, and dependency or data-flow graphs where supported. Each view helps you move from a broad signal to the source behind it.

## Treemap

The treemap shows folders, files, functions, and code fragments as nested rectangles. Area represents lines of code (LOC). Choose a metric to color the rectangles and change the legend. A folder or file can be opened to focus the map on that part of the repository.

Use the path and file-type controls to focus the view. You can also hide selected paths from the current view. These view controls change what you see; they do not rewrite the source files.

## Explorer and Hot Spots

The explorer lists the scanned tree with sortable columns. Which columns apply depends on the selected node and metric. Select a row to focus the corresponding node and open its code where available.

Hot Spots ranks files or functions against peers of the same type for one metric. Use it to find a high value to inspect, then open the row and check its witness, source lines, and measurement availability. A ranking is a prompt for review, not a diagnosis.

## The 2×2 view

The 2×2 view places files, functions, or supported components on two metric axes. Srcly includes presets such as activity, blast radius, component weight, comment noise, and findings. The view groups points into quadrants; you can adjust the cut-offs and select a group to inspect its members.

Some presets or cohorts do not apply to every project. Srcly omits unavailable points or explains why a view has no usable data. A point's position reflects the selected metrics and cut-offs, not an overall quality grade.

## Inspect source and relationships

Select a file or function to open the code viewer. Metrics and findings can link to lines that contributed to a result. Use the dependency graph to inspect TypeScript and TSX import relationships. It can include external packages and nearby TypeScript path aliases.

The separate Data flow view traces modeled routes, values, and function effects. Its supported language and analysis limits differ from the dependency graph. See [Data-flow analysis](../data-flow/).

## A useful review sequence

1. Choose a metric that matches the question you have.
2. Find a folder or file with a high or unexpected value.
3. Open its code and check the metric's definition and witness.
4. Check whether related findings or dependencies add context.
5. Confirm any suspected issue in the source and with your project tools.

This sequence avoids treating file size, complexity, or a static-analysis message as proof of a bug. See [Understand metrics](../metrics/) and [Read findings](../findings/) for how Srcly reports these signals.
