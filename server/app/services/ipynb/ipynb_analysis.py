import json
from typing import List

from app.services.analysis_types import FileMetrics, FunctionMetrics


class NotebookAnalyzer:
    """
    Lightweight analysis pipeline for Jupyter notebooks.

    The goal is to:
    - Treat each cell as a "scope" so it can appear as a child in the treemap.
    - Count LOC **only** from the `source` field of each cell (code/markdown/raw).
      We explicitly ignore any `outputs`/execution metadata so that large output-
      heavy notebooks don't dominate the treemap.
    """

    def analyze_file(self, file_path: str) -> FileMetrics:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        cells = data.get("cells") or []

        function_list: List[FunctionMetrics] = []
        current_line = 1
        total_nloc = 0

        for idx, cell in enumerate(cells):
            cell_type = cell.get("cell_type", "cell")
            source = cell.get("source", "")

            # `source` can be a list of lines or a single string.
            if isinstance(source, list):
                text = "".join(source)
            else:
                text = str(source)

            lines = text.splitlines()
            # Count only non-empty lines of actual content.
            non_empty_lines = [ln for ln in lines if ln.strip()]
            loc = len(non_empty_lines)

            if loc <= 0:
                # Skip zero-LOC cells entirely for treemap sizing purposes.
                continue

            start_line = current_line
            end_line = current_line + loc - 1
            current_line = end_line + 1
            total_nloc += loc

            name = f"[{cell_type}] cell {idx + 1}"

            cell_metrics = FunctionMetrics(
                name=name,
                cyclomatic_complexity=0,
                nloc=loc,
                start_line=start_line,
                end_line=end_line,
            )
            function_list.append(cell_metrics)

        # Aggregate simple file-level metrics.
        average_complexity = (
            sum(f.cyclomatic_complexity for f in function_list) / len(function_list)
            if function_list
            else 0.0
        )

        average_function_length = (
            total_nloc / len(function_list) if function_list else 0.0
        )

        return FileMetrics(
            nloc=total_nloc,
            average_cyclomatic_complexity=average_complexity,
            function_list=function_list,
            filename=file_path,
            comment_lines=0,
            comment_density=0.0,
            max_nesting_depth=0,
            average_function_length=average_function_length,
            parameter_count=0,
            todo_count=0,
            classes_count=0,
            # TS/TSX-specific metrics remain at their defaults (all zeros) for notebooks.
        )

    def _get_non_empty_lines(self, cells: list) -> list[str]:
        """
        Helper to extract all non-empty lines from valid cells, exactly as
        analyze_file does for counting LOC.
        """
        all_lines = []
        for cell in cells:
            source = cell.get("source", "")
            if isinstance(source, list):
                text = "".join(source)
            else:
                text = str(source)
            
            lines = text.splitlines()
            non_empty = [ln for ln in lines if ln.strip()]
            
            # analyze_file skips cells with 0 LOC entirely
            if not non_empty:
                continue
                
            all_lines.extend(non_empty)
            
        return all_lines

    def get_virtual_content(self, file_path: str) -> str:
        """
        Returns the "virtual" file content that corresponds to the
        analysis metrics (line numbers, etc).
        
        For notebooks, this is the concatenation of all non-empty
        lines from all cells, joined by newlines.
        """
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        cells = data.get("cells") or []
        lines = self._get_non_empty_lines(cells)
        return "\n".join(lines)



