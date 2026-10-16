# context-recorder @ 76afc4faa2

## code · file (n=62)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 62 | 0% | 2% | 22 | 36 |
| complexity_avg | 61 | 2% | 0% | 53 | 19 |
| loc | 62 | 0% | 0% | 58 | 465 |
| parameter_count | 62 | 0% | 3% | 31 | 51 |
| commit_count | 62 | 0% | 0% | 11 | 30 |
| churn_lines | 62 | 0% | 0% | 60 | 1416 |
| fan_in | 5 | 92% | 100% | 1 | 0 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 62 | 0.987 | 9/10 | 25/25 |
| complexity × complexity_avg | 61 | 0.797 | 6/10 | 18/25 |
| parameter_count × churn_lines | 62 | 0.55 | 5/10 | 15/25 |
| loc × parameter_count | 62 | 0.542 | 6/10 | 15/25 |
| commit_count × churn_lines | 62 | 0.453 | 6/10 | 17/25 |
| loc × commit_count | 62 | 0.399 | 5/10 | 17/25 |
| complexity × parameter_count | 62 | 0.369 | 3/10 | 12/25 |
| complexity × loc | 62 | 0.292 | 3/10 | 13/25 |
| complexity × churn_lines | 62 | 0.291 | 2/10 | 13/25 |
| complexity × commit_count | 62 | 0.129 | 2/10 | 12/25 |
| parameter_count × commit_count | 62 | 0.097 | 2/10 | 13/25 |
| complexity_avg × commit_count | 61 | -0.052 | 1/10 | 7/25 |

Constant here (correlations undefined): fan_in

## code · function (n=794)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 794 | 0% | 0% | 24 | 36 |
| loc | 794 | 0% | 0% | 52 | 75 |
| parameter_count | 794 | 0% | 31% | 10 | 11 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × loc | 794 | 0.674 | 2/10 | 9/25 |
| loc × parameter_count | 794 | 0.226 | 0/10 | 1/25 |
| complexity × parameter_count | 794 | 0.195 | 0/10 | 1/25 |

## markdown · file (n=35)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 35 | 0% | 0% | 34 | 1193 |
| md_data_url_count | 35 | 0% | 100% | 1 | 0 |
| commit_count | 35 | 0% | 0% | 5 | 28 |
| churn_lines | 35 | 0% | 0% | 33 | 1860 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 35 | 0.949 | 9/10 | 23/25 |
| commit_count × churn_lines | 35 | 0.343 | 3/10 | 15/17 |
| loc × commit_count | 35 | 0.259 | 3/10 | 14/17 |

Constant here (correlations undefined): md_data_url_count

## python · function (n=73)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 73 | 0% | 0% | 13 | 21 |
| loc | 73 | 0% | 0% | 27 | 132 |
| comment_noise | 73 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 73 | 0% | 38% | 5 | 4 |
| parameter_count | 73 | 0% | 19% | 5 | 4 |
| comment_ratio | 73 | 0% | 88% | 10 | 0.17 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 73 | 0.806 | 5/10 | 17/25 |
| complexity × loc | 73 | 0.76 | 6/10 | 20/25 |
| loc × max_nesting_depth | 73 | 0.733 | 3/10 | 17/25 |
| loc × comment_ratio | 73 | 0.37 | 5/9 | 7/9 |
| complexity × comment_ratio | 73 | 0.193 | 3/9 | 6/9 |
| max_nesting_depth × comment_ratio | 73 | 0.188 | 2/9 | 6/9 |
| complexity × parameter_count | 73 | 0.165 | 4/10 | 10/25 |
| loc × parameter_count | 73 | 0.121 | 2/10 | 12/25 |
| max_nesting_depth × parameter_count | 73 | 0.121 | 5/10 | 13/25 |
| parameter_count × comment_ratio | 73 | -0.024 | 1/9 | 3/9 |

Constant here (correlations undefined): comment_noise
