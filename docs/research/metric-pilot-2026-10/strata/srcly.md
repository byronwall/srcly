# srcly @ 284876d000

## code · function (n=32)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 32 | 0% | 0% | 9 | 14 |
| loc | 32 | 0% | 0% | 12 | 30 |
| parameter_count | 32 | 0% | 47% | 4 | 3 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × parameter_count | 32 | 0.656 | 5/10 | 16/17 |
| complexity × loc | 32 | 0.608 | 8/10 | 11/13 |
| complexity × parameter_count | 32 | 0.227 | 4/10 | 9/13 |

## markdown · file (n=44)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 44 | 0% | 0% | 37 | 707 |
| md_data_url_count | 44 | 0% | 93% | 2 | 1 |
| commit_count | 44 | 0% | 25% | 7 | 38 |
| churn_lines | 44 | 0% | 25% | 28 | 416 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 44 | 0.679 | 4/10 | 19/25 |
| loc × churn_lines | 44 | 0.289 | 4/10 | 17/25 |
| md_data_url_count × commit_count | 44 | -0.143 | 1/3 | 1/3 |
| loc × commit_count | 44 | 0.109 | 4/10 | 15/25 |
| loc × md_data_url_count | 44 | 0.103 | 2/3 | 2/3 |
| md_data_url_count × churn_lines | 44 | -0.097 | 1/3 | 1/3 |

## python · file (n=111)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 111 | 0% | 5% | 23 | 66 |
| complexity_avg | 105 | 5% | 0% | 69 | 7.95 |
| loc | 111 | 0% | 1% | 91 | 1036 |
| comment_noise | 111 | 0% | 98% | 3 | 3 |
| max_nesting_depth | 111 | 0% | 24% | 7 | 7 |
| parameter_count | 111 | 0% | 10% | 46 | 127 |
| commit_count | 111 | 0% | 16% | 11 | 14 |
| churn_lines | 111 | 0% | 17% | 82 | 1524 |
| finding_count | 111 | 0% | 90% | 3 | 2 |
| error_count | 111 | 0% | 100% | 1 | 0 |
| fan_in | 111 | 0% | 54% | 18 | 33 |
| comment_ratio | 110 | 1% | 17% | 89 | 0.38 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × complexity_avg | 105 | 0.885 | 6/10 | 20/25 |
| complexity × max_nesting_depth | 111 | 0.88 | 6/10 | 16/25 |
| loc × parameter_count | 111 | 0.814 | 5/10 | 20/25 |
| complexity_avg × max_nesting_depth | 105 | 0.779 | 5/10 | 16/25 |
| loc × churn_lines | 111 | 0.758 | 8/10 | 20/25 |
| parameter_count × churn_lines | 111 | 0.733 | 5/10 | 19/25 |
| complexity × loc | 111 | 0.699 | 4/10 | 16/25 |
| commit_count × churn_lines | 111 | 0.677 | 6/10 | 12/25 |
| loc × max_nesting_depth | 111 | 0.669 | 6/10 | 14/25 |
| complexity × parameter_count | 111 | 0.654 | 1/10 | 12/25 |
| max_nesting_depth × parameter_count | 111 | 0.629 | 3/10 | 11/25 |
| max_nesting_depth × churn_lines | 111 | 0.599 | 5/10 | 12/25 |

Constant here (correlations undefined): error_count

## python · function (n=1215)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 1215 | 0% | 0% | 25 | 66 |
| loc | 1215 | 0% | 0% | 81 | 282 |
| comment_noise | 1215 | 0% | 100% | 2 | 1 |
| max_nesting_depth | 1215 | 0% | 54% | 7 | 7 |
| parameter_count | 1215 | 0% | 16% | 12 | 18 |
| comment_ratio | 1215 | 0% | 77% | 106 | 0.52 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 1215 | 0.884 | 5/10 | 9/25 |
| loc × max_nesting_depth | 1215 | 0.52 | 5/10 | 6/25 |
| complexity × loc | 1215 | 0.513 | 7/10 | 13/25 |
| loc × comment_ratio | 1215 | 0.438 | 1/10 | 3/25 |
| loc × parameter_count | 1215 | 0.384 | 1/10 | 6/25 |
| max_nesting_depth × parameter_count | 1215 | 0.321 | 1/10 | 1/25 |
| complexity × parameter_count | 1215 | 0.305 | 1/10 | 2/25 |
| complexity × comment_ratio | 1215 | 0.097 | 0/10 | 1/25 |
| comment_noise × comment_ratio | 1215 | 0.094 | 3/4 | 3/4 |
| max_nesting_depth × comment_ratio | 1215 | 0.087 | 0/10 | 0/25 |
| parameter_count × comment_ratio | 1215 | 0.065 | 0/10 | 0/25 |
| loc × comment_noise | 1215 | 0.055 | 0/4 | 0/4 |

## text · file (n=15)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 15 | 0% | 0% | 14 | 71 |
| commit_count | 15 | 0% | 40% | 4 | 7 |
| churn_lines | 15 | 0% | 40% | 9 | 86 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 15 | 0.882 | 9/9 | 9/9 |
| loc × churn_lines | 15 | 0.51 | 7/9 | 9/9 |
| loc × commit_count | 15 | 0.504 | 7/9 | 9/9 |

## ts · file (n=106)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 106 | 0% | 4% | 24 | 111 |
| complexity_avg | 102 | 4% | 0% | 67 | 18 |
| loc | 106 | 0% | 0% | 75 | 1133 |
| comment_noise | 106 | 0% | 98% | 3 | 2 |
| max_nesting_depth | 106 | 0% | 39% | 6 | 5 |
| parameter_count | 106 | 0% | 13% | 31 | 207 |
| ts_any_usage_count | 106 | 0% | 77% | 11 | 31 |
| ts_ignore_count | 106 | 0% | 100% | 1 | 0 |
| commit_count | 106 | 0% | 17% | 10 | 9 |
| churn_lines | 106 | 0% | 17% | 75 | 1512 |
| finding_count | 106 | 0% | 100% | 1 | 0 |
| error_count | 106 | 0% | 100% | 1 | 0 |
| fan_in | 106 | 0% | 42% | 15 | 23 |
| comment_ratio | 106 | 0% | 29% | 69 | 0.59 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × complexity_avg | 102 | 0.912 | 4/10 | 16/25 |
| loc × churn_lines | 106 | 0.853 | 9/10 | 20/25 |
| complexity × max_nesting_depth | 106 | 0.843 | 4/10 | 14/25 |
| commit_count × churn_lines | 106 | 0.837 | 7/10 | 16/25 |
| loc × parameter_count | 106 | 0.772 | 8/10 | 18/25 |
| complexity_avg × max_nesting_depth | 102 | 0.756 | 4/10 | 10/25 |
| complexity_avg × fan_in | 102 | 0.745 | 2/10 | 10/25 |
| parameter_count × churn_lines | 106 | 0.739 | 7/10 | 18/25 |
| complexity × fan_in | 106 | 0.65 | 2/10 | 9/25 |
| max_nesting_depth × fan_in | 106 | 0.628 | 3/10 | 13/25 |
| complexity × parameter_count | 106 | 0.614 | 4/10 | 13/25 |
| loc × commit_count | 106 | 0.613 | 6/10 | 12/25 |

Constant here (correlations undefined): error_count, finding_count, ts_ignore_count

## ts · function (n=1282)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 1282 | 0% | 0% | 25 | 111 |
| loc | 1282 | 0% | 0% | 76 | 449 |
| comment_noise | 1282 | 0% | 100% | 2 | 1 |
| max_nesting_depth | 1282 | 0% | 75% | 6 | 5 |
| parameter_count | 1282 | 0% | 33% | 7 | 6 |
| comment_ratio | 1282 | 0% | 90% | 74 | 0.50 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 1282 | 0.734 | 1/10 | 6/25 |
| loc × max_nesting_depth | 1282 | 0.571 | 2/10 | 5/25 |
| complexity × parameter_count | 1282 | 0.465 | 2/10 | 3/25 |
| loc × comment_ratio | 1282 | 0.409 | 0/10 | 1/25 |
| complexity × loc | 1282 | 0.376 | 4/10 | 7/25 |
| max_nesting_depth × comment_ratio | 1282 | 0.361 | 0/10 | 0/25 |
| max_nesting_depth × parameter_count | 1282 | 0.318 | 1/10 | 1/25 |
| complexity × comment_ratio | 1282 | 0.219 | 0/10 | 0/25 |
| loc × parameter_count | 1282 | -0.152 | 1/10 | 1/25 |
| comment_noise × comment_ratio | 1282 | 0.104 | 2/3 | 2/3 |
| parameter_count × comment_ratio | 1282 | -0.035 | 0/10 | 0/25 |
| loc × comment_noise | 1282 | 0.029 | 0/3 | 0/3 |

## tsx · component (n=128)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 128 | 0% | 0% | 9 | 12 |
| loc | 128 | 0% | 0% | 77 | 635 |
| comment_noise | 128 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 128 | 0% | 67% | 5 | 4 |
| parameter_count | 128 | 0% | 9% | 3 | 2 |
| component_loc | 128 | 0% | 0% | 77 | 635 |
| component_hook_count | 128 | 0% | 63% | 17 | 22 |
| component_effect_count | 128 | 0% | 83% | 6 | 5 |
| component_jsx_depth | 128 | 0% | 0% | 13 | 13 |
| component_prop_count | 128 | 0% | 9% | 17 | 20 |
| component_inline_handler_count | 128 | 0% | 56% | 13 | 14 |
| component_jsx_conditional_count | 128 | 0% | 33% | 14 | 17 |
| comment_ratio | 128 | 0% | 69% | 40 | 0.11 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × component_loc | 128 | 1.0 | 10/10 | 25/25 |
| loc × component_jsx_depth | 128 | 0.831 | 5/10 | 15/25 |
| component_loc × component_jsx_depth | 128 | 0.831 | 5/10 | 15/25 |
| component_jsx_depth × component_jsx_conditional_count | 128 | 0.831 | 6/10 | 17/25 |
| loc × component_inline_handler_count | 128 | 0.75 | 5/10 | 18/25 |
| loc × component_jsx_conditional_count | 128 | 0.75 | 5/10 | 17/25 |
| component_loc × component_inline_handler_count | 128 | 0.75 | 5/10 | 18/25 |
| component_loc × component_jsx_conditional_count | 128 | 0.75 | 5/10 | 17/25 |
| loc × component_hook_count | 128 | 0.738 | 6/10 | 18/25 |
| component_loc × component_hook_count | 128 | 0.738 | 6/10 | 18/25 |
| loc × comment_ratio | 128 | 0.735 | 3/10 | 17/25 |
| component_loc × comment_ratio | 128 | 0.735 | 3/10 | 17/25 |

Constant here (correlations undefined): comment_noise

## tsx · file (n=62)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 62 | 0% | 0% | 18 | 54 |
| complexity_avg | 62 | 0% | 0% | 53 | 4 |
| loc | 62 | 0% | 0% | 59 | 875 |
| comment_noise | 62 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 62 | 0% | 34% | 5 | 4 |
| parameter_count | 62 | 0% | 0% | 28 | 90 |
| component_loc | 61 | 2% | 0% | 53 | 635 |
| component_hook_count | 61 | 2% | 30% | 17 | 22 |
| component_effect_count | 61 | 2% | 64% | 6 | 5 |
| component_jsx_depth | 61 | 2% | 0% | 13 | 13 |
| component_prop_count | 61 | 2% | 3% | 17 | 20 |
| component_inline_handler_count | 61 | 2% | 26% | 13 | 14 |
| component_jsx_conditional_count | 61 | 2% | 16% | 14 | 17 |
| ts_any_usage_count | 62 | 0% | 74% | 10 | 14 |
| ts_ignore_count | 62 | 0% | 100% | 1 | 0 |
| commit_count | 62 | 0% | 13% | 13 | 14 |
| churn_lines | 62 | 0% | 13% | 54 | 1337 |
| finding_count | 62 | 0% | 100% | 1 | 0 |
| error_count | 62 | 0% | 100% | 1 | 0 |
| fan_in | 62 | 0% | 10% | 11 | 31 |
| comment_ratio | 62 | 0% | 16% | 52 | 0.36 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × component_loc | 61 | 0.921 | 8/10 | 22/25 |
| loc × parameter_count | 62 | 0.899 | 8/10 | 20/25 |
| loc × churn_lines | 62 | 0.869 | 6/10 | 22/25 |
| commit_count × churn_lines | 62 | 0.84 | 7/10 | 20/25 |
| parameter_count × churn_lines | 62 | 0.821 | 6/10 | 19/25 |
| complexity × component_loc | 61 | 0.818 | 5/10 | 20/25 |
| parameter_count × component_loc | 61 | 0.814 | 6/10 | 19/25 |
| parameter_count × component_hook_count | 61 | 0.811 | 7/10 | 22/25 |
| complexity × loc | 62 | 0.807 | 6/10 | 19/25 |
| component_loc × component_hook_count | 61 | 0.789 | 6/10 | 19/25 |
| component_jsx_depth × component_jsx_conditional_count | 61 | 0.779 | 7/10 | 18/25 |
| component_loc × churn_lines | 61 | 0.778 | 4/10 | 22/25 |

Constant here (correlations undefined): comment_noise, error_count, finding_count, ts_ignore_count

## tsx · function (n=1169)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 1169 | 0% | 0% | 17 | 54 |
| loc | 1169 | 0% | 0% | 52 | 218 |
| comment_noise | 1169 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 1169 | 0% | 78% | 5 | 4 |
| parameter_count | 1169 | 0% | 49% | 6 | 5 |
| comment_ratio | 1169 | 0% | 95% | 32 | 0.40 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 1169 | 0.615 | 4/10 | 9/25 |
| loc × max_nesting_depth | 1169 | 0.558 | 1/10 | 4/25 |
| complexity × loc | 1169 | 0.553 | 4/10 | 6/25 |
| loc × parameter_count | 1169 | 0.299 | 0/10 | 2/25 |
| loc × comment_ratio | 1169 | 0.299 | 0/10 | 2/25 |
| max_nesting_depth × comment_ratio | 1169 | 0.299 | 1/10 | 2/25 |
| complexity × comment_ratio | 1169 | 0.222 | 1/10 | 1/25 |
| complexity × parameter_count | 1169 | 0.163 | 0/10 | 1/25 |
| max_nesting_depth × parameter_count | 1169 | 0.107 | 2/10 | 4/25 |
| parameter_count × comment_ratio | 1169 | 0.054 | 0/10 | 2/25 |

Constant here (correlations undefined): comment_noise
