# explorEDA @ db1875b25d

## code · file (n=40)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 40 | 0% | 30% | 15 | 67 |
| complexity_avg | 28 | 30% | 0% | 24 | 6 |
| loc | 40 | 0% | 0% | 33 | 10825 |
| parameter_count | 40 | 0% | 30% | 15 | 581 |
| commit_count | 40 | 0% | 10% | 5 | 4 |
| churn_lines | 40 | 0% | 10% | 33 | 12990 |
| finding_count | 9 | 78% | 100% | 1 | 0 |
| error_count | 9 | 78% | 100% | 1 | 0 |
| fan_in | 35 | 12% | 83% | 4 | 6 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 40 | 0.967 | 9/10 | 25/25 |
| complexity × complexity_avg | 28 | 0.843 | 9/10 | 25/25 |
| complexity × loc | 40 | 0.809 | 8/10 | 20/25 |
| complexity × parameter_count | 40 | 0.796 | 6/10 | 23/25 |
| complexity × churn_lines | 40 | 0.784 | 7/10 | 20/25 |
| loc × parameter_count | 40 | 0.727 | 6/10 | 21/25 |
| parameter_count × churn_lines | 40 | 0.718 | 6/10 | 21/25 |
| complexity_avg × loc | 28 | 0.437 | 7/10 | 20/25 |
| complexity_avg × churn_lines | 28 | 0.389 | 6/10 | 20/25 |
| parameter_count × fan_in | 35 | 0.382 | 4/6 | 5/6 |
| commit_count × churn_lines | 40 | 0.356 | 3/10 | 18/25 |
| complexity × commit_count | 40 | 0.32 | 3/10 | 20/25 |

Constant here (correlations undefined): error_count, finding_count

## code · function (n=1200)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 1200 | 0% | 0% | 33 | 67 |
| loc | 1200 | 0% | 0% | 72 | 290 |
| parameter_count | 1200 | 0% | 59% | 8 | 7 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × loc | 1200 | 0.778 | 4/10 | 15/25 |
| loc × parameter_count | 1200 | 0.41 | 0/10 | 0/25 |
| complexity × parameter_count | 1200 | 0.384 | 0/10 | 3/25 |

## markdown · file (n=464)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 464 | 0% | 0% | 165 | 25335 |
| md_data_url_count | 464 | 0% | 73% | 9 | 91 |
| commit_count | 464 | 0% | 1% | 17 | 39 |
| churn_lines | 464 | 0% | 12% | 167 | 27280 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 464 | 0.613 | 6/10 | 20/25 |
| commit_count × churn_lines | 464 | 0.335 | 1/10 | 5/25 |
| md_data_url_count × churn_lines | 464 | -0.283 | 3/10 | 5/25 |
| loc × md_data_url_count | 464 | -0.161 | 4/10 | 8/25 |
| md_data_url_count × commit_count | 464 | 0.096 | 0/10 | 1/25 |
| loc × commit_count | 464 | 0.091 | 0/10 | 4/25 |

## python · function (n=31)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 31 | 0% | 0% | 6 | 15 |
| loc | 31 | 0% | 0% | 13 | 61 |
| comment_noise | 31 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 31 | 0% | 55% | 4 | 3 |
| parameter_count | 31 | 0% | 48% | 5 | 4 |
| comment_ratio | 31 | 0% | 100% | 1 | 0 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 31 | 0.977 | 9/10 | 14/14 |
| complexity × loc | 31 | 0.758 | 6/10 | 14/14 |
| loc × max_nesting_depth | 31 | 0.745 | 5/10 | 14/14 |
| loc × parameter_count | 31 | 0.436 | 4/10 | 16/16 |
| max_nesting_depth × parameter_count | 31 | 0.325 | 5/10 | 10/14 |
| complexity × parameter_count | 31 | 0.288 | 5/10 | 10/14 |

Constant here (correlations undefined): comment_noise, comment_ratio

## text · file (n=176)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 176 | 0% | 1% | 82 | 2734 |
| commit_count | 176 | 0% | 2% | 10 | 12 |
| churn_lines | 176 | 0% | 3% | 86 | 2734 |
| fan_in | 1 | 99% | 100% | 1 | 0 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 176 | 0.858 | 10/10 | 21/25 |
| commit_count × churn_lines | 176 | 0.122 | 0/10 | 4/25 |
| loc × commit_count | 176 | -0.07 | 0/10 | 0/25 |

Constant here (correlations undefined): fan_in

## ts · file (n=611)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 611 | 0% | 8% | 54 | 262 |
| complexity_avg | 559 | 8% | 0% | 248 | 63 |
| loc | 611 | 0% | 0% | 309 | 6458 |
| comment_noise | 611 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 611 | 0% | 36% | 6 | 5 |
| parameter_count | 611 | 0% | 14% | 77 | 523 |
| ts_any_usage_count | 611 | 0% | 100% | 2 | 1 |
| ts_ignore_count | 611 | 0% | 100% | 2 | 1 |
| commit_count | 611 | 0% | 2% | 30 | 84 |
| churn_lines | 611 | 0% | 2% | 324 | 7479 |
| finding_count | 611 | 0% | 69% | 28 | 193 |
| error_count | 611 | 0% | 100% | 1 | 0 |
| fan_in | 607 | 1% | 38% | 46 | 305 |
| comment_ratio | 611 | 0% | 17% | 419 | 1 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 611 | 0.962 | 8/10 | 22/25 |
| complexity × complexity_avg | 559 | 0.918 | 3/10 | 6/25 |
| complexity × max_nesting_depth | 611 | 0.745 | 3/10 | 8/25 |
| complexity × parameter_count | 611 | 0.706 | 3/10 | 7/25 |
| loc × parameter_count | 611 | 0.692 | 6/10 | 15/25 |
| parameter_count × churn_lines | 611 | 0.683 | 4/10 | 15/25 |
| complexity_avg × max_nesting_depth | 559 | 0.675 | 1/10 | 1/25 |
| complexity × finding_count | 611 | 0.562 | 4/10 | 12/25 |
| complexity_avg × fan_in | 559 | 0.559 | 1/10 | 3/25 |
| complexity × churn_lines | 611 | 0.522 | 3/10 | 8/25 |
| max_nesting_depth × parameter_count | 611 | 0.52 | 4/10 | 8/25 |
| commit_count × churn_lines | 611 | 0.514 | 6/10 | 14/25 |

Constant here (correlations undefined): comment_noise, error_count

## ts · function (n=8932)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 8932 | 0% | 0% | 59 | 262 |
| loc | 8932 | 0% | 0% | 203 | 2233 |
| comment_noise | 8932 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 8932 | 0% | 81% | 6 | 5 |
| parameter_count | 8932 | 0% | 22% | 10 | 9 |
| comment_ratio | 8932 | 0% | 92% | 244 | 0.40 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 8932 | 0.638 | 3/10 | 6/25 |
| loc × max_nesting_depth | 8932 | 0.56 | 2/10 | 8/25 |
| complexity × loc | 8932 | 0.424 | 5/10 | 11/25 |
| loc × comment_ratio | 8932 | 0.404 | 0/10 | 0/25 |
| complexity × parameter_count | 8932 | 0.36 | 0/10 | 2/25 |
| max_nesting_depth × comment_ratio | 8932 | 0.31 | 0/10 | 0/25 |
| max_nesting_depth × parameter_count | 8932 | 0.259 | 1/10 | 4/25 |
| complexity × comment_ratio | 8932 | 0.165 | 0/10 | 0/25 |
| parameter_count × comment_ratio | 8932 | -0.056 | 0/10 | 0/25 |
| loc × parameter_count | 8932 | -0.036 | 0/10 | 1/25 |

Constant here (correlations undefined): comment_noise

## tsx · component (n=802)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 802 | 0% | 0% | 48 | 100 |
| loc | 802 | 0% | 0% | 242 | 1066 |
| comment_noise | 802 | 0% | 100% | 2 | 1 |
| max_nesting_depth | 802 | 0% | 63% | 5 | 4 |
| parameter_count | 802 | 0% | 18% | 3 | 2 |
| component_loc | 802 | 0% | 0% | 242 | 1066 |
| component_hook_count | 802 | 0% | 48% | 32 | 75 |
| component_effect_count | 802 | 0% | 88% | 8 | 10 |
| component_jsx_depth | 802 | 0% | 0% | 11 | 11 |
| component_prop_count | 802 | 0% | 20% | 19 | 25 |
| component_inline_handler_count | 802 | 0% | 54% | 23 | 42 |
| component_jsx_conditional_count | 802 | 0% | 49% | 24 | 62 |
| comment_ratio | 802 | 0% | 76% | 170 | 0.16 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × component_loc | 802 | 1.0 | 10/10 | 25/25 |
| complexity × component_jsx_conditional_count | 802 | 0.833 | 4/10 | 14/25 |
| loc × component_jsx_depth | 802 | 0.809 | 0/10 | 6/25 |
| component_loc × component_jsx_depth | 802 | 0.809 | 0/10 | 6/25 |
| complexity × loc | 802 | 0.743 | 4/10 | 17/25 |
| complexity × component_loc | 802 | 0.743 | 4/10 | 17/25 |
| loc × component_jsx_conditional_count | 802 | 0.707 | 1/10 | 10/25 |
| component_loc × component_jsx_conditional_count | 802 | 0.707 | 1/10 | 10/25 |
| loc × component_inline_handler_count | 802 | 0.673 | 3/10 | 13/25 |
| component_loc × component_inline_handler_count | 802 | 0.673 | 3/10 | 13/25 |
| component_jsx_depth × component_jsx_conditional_count | 802 | 0.656 | 1/10 | 9/25 |
| parameter_count × component_prop_count | 802 | 0.648 | 2/10 | 4/25 |

## tsx · file (n=431)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 431 | 0% | 0% | 48 | 100 |
| complexity_avg | 431 | 0% | 0% | 226 | 14.67 |
| loc | 431 | 0% | 0% | 289 | 3313 |
| comment_noise | 431 | 0% | 100% | 2 | 1 |
| max_nesting_depth | 431 | 0% | 43% | 5 | 4 |
| parameter_count | 431 | 0% | 4% | 70 | 275 |
| component_loc | 371 | 14% | 0% | 207 | 1066 |
| component_hook_count | 371 | 14% | 24% | 32 | 75 |
| component_effect_count | 371 | 14% | 76% | 8 | 10 |
| component_jsx_depth | 371 | 14% | 0% | 11 | 11 |
| component_prop_count | 371 | 14% | 20% | 19 | 25 |
| component_inline_handler_count | 371 | 14% | 37% | 23 | 42 |
| component_jsx_conditional_count | 371 | 14% | 35% | 24 | 62 |
| ts_any_usage_count | 431 | 0% | 100% | 2 | 4 |
| ts_ignore_count | 431 | 0% | 100% | 1 | 0 |
| commit_count | 431 | 0% | 3% | 32 | 66 |
| churn_lines | 431 | 0% | 3% | 318 | 3896 |
| finding_count | 431 | 0% | 60% | 26 | 37 |
| error_count | 431 | 0% | 100% | 1 | 0 |
| fan_in | 431 | 0% | 27% | 25 | 204 |
| comment_ratio | 431 | 0% | 31% | 264 | 0.46 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × churn_lines | 431 | 0.893 | 6/10 | 17/25 |
| complexity × component_loc | 371 | 0.866 | 4/10 | 17/25 |
| complexity × complexity_avg | 431 | 0.864 | 1/10 | 4/25 |
| complexity × component_jsx_conditional_count | 371 | 0.856 | 4/10 | 15/25 |
| loc × parameter_count | 431 | 0.85 | 7/10 | 16/25 |
| component_loc × component_jsx_conditional_count | 371 | 0.787 | 1/10 | 10/25 |
| component_loc × component_jsx_depth | 371 | 0.779 | 0/10 | 6/25 |
| parameter_count × churn_lines | 431 | 0.762 | 3/10 | 15/25 |
| component_loc × component_inline_handler_count | 371 | 0.752 | 3/10 | 13/25 |
| loc × component_loc | 371 | 0.751 | 5/10 | 12/25 |
| complexity_avg × component_jsx_conditional_count | 371 | 0.739 | 3/10 | 5/25 |
| parameter_count × component_loc | 371 | 0.734 | 3/10 | 16/25 |

Constant here (correlations undefined): error_count, ts_ignore_count

## tsx · function (n=8064)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 8064 | 0% | 0% | 27 | 31 |
| loc | 8064 | 0% | 0% | 138 | 1055 |
| comment_noise | 8064 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 8064 | 0% | 84% | 5 | 4 |
| parameter_count | 8064 | 0% | 32% | 9 | 9 |
| comment_ratio | 8064 | 0% | 95% | 132 | 0.40 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 8064 | 0.613 | 1/10 | 4/25 |
| complexity × loc | 8064 | 0.496 | 0/10 | 2/25 |
| loc × max_nesting_depth | 8064 | 0.482 | 0/10 | 1/25 |
| loc × comment_ratio | 8064 | 0.324 | 0/10 | 0/25 |
| max_nesting_depth × comment_ratio | 8064 | 0.291 | 0/10 | 0/25 |
| complexity × parameter_count | 8064 | 0.22 | 0/10 | 0/25 |
| complexity × comment_ratio | 8064 | 0.19 | 0/10 | 0/25 |
| parameter_count × comment_ratio | 8064 | -0.08 | 0/10 | 0/25 |
| loc × parameter_count | 8064 | -0.061 | 0/10 | 0/25 |
| max_nesting_depth × parameter_count | 8064 | 0.042 | 0/10 | 0/25 |

Constant here (correlations undefined): comment_noise
