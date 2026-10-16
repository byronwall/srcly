# recipes-modern @ 7a798f2526

## code · file (n=31)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 31 | 0% | 90% | 4 | 7 |
| complexity_avg | 3 | 90% | 0% | 3 | 2.11 |
| loc | 31 | 0% | 0% | 19 | 335 |
| parameter_count | 31 | 0% | 90% | 4 | 15 |
| commit_count | 31 | 0% | 90% | 2 | 1 |
| churn_lines | 31 | 0% | 90% | 4 | 350 |
| finding_count | 4 | 87% | 100% | 1 | 0 |
| error_count | 4 | 87% | 100% | 1 | 0 |
| fan_in | 8 | 74% | 88% | 2 | 12 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 31 | 0.998 | 3/3 | 3/3 |
| complexity × parameter_count | 31 | 0.995 | 3/3 | 3/3 |
| parameter_count × churn_lines | 31 | 0.678 | 2/3 | 2/3 |
| parameter_count × commit_count | 31 | 0.654 | 2/3 | 2/3 |
| complexity × churn_lines | 31 | 0.629 | 2/3 | 2/3 |
| complexity × commit_count | 31 | 0.606 | 2/3 | 2/3 |
| loc × parameter_count | 31 | 0.517 | 3/3 | 3/3 |
| complexity × loc | 31 | 0.514 | 3/3 | 3/3 |
| complexity × fan_in | 8 | -0.283 | 0/1 | 0/1 |
| parameter_count × fan_in | 8 | -0.283 | 0/1 | 0/1 |
| loc × churn_lines | 31 | 0.23 | 2/3 | 2/3 |
| commit_count × fan_in | 8 | -0.218 | 0/1 | 0/1 |

Constant here (correlations undefined): error_count, finding_count

## code · function (n=62)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 62 | 0% | 0% | 5 | 7 |
| loc | 62 | 0% | 0% | 17 | 164 |
| parameter_count | 62 | 0% | 76% | 3 | 2 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × loc | 62 | 0.546 | 5/10 | 12/14 |
| loc × parameter_count | 62 | 0.478 | 4/10 | 12/15 |
| complexity × parameter_count | 62 | 0.257 | 3/10 | 6/14 |

## markdown · file (n=10)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 10 | 0% | 0% | 10 | 636 |
| md_data_url_count | 10 | 0% | 60% | 3 | 10 |
| commit_count | 10 | 0% | 100% | 1 | 0 |
| churn_lines | 10 | 0% | 100% | 1 | 0 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × md_data_url_count | 10 | 0.846 | 4/4 | 4/4 |

Constant here (correlations undefined): churn_lines, commit_count

## text · file (n=10)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| loc | 10 | 0% | 0% | 9 | 227 |
| commit_count | 10 | 0% | 80% | 2 | 1 |
| churn_lines | 10 | 0% | 80% | 3 | 3 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 10 | 0.994 | 2/2 | 2/2 |
| loc × commit_count | 10 | 0.437 | 2/2 | 2/2 |
| loc × churn_lines | 10 | 0.399 | 2/2 | 2/2 |

## ts · file (n=38)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 38 | 0% | 18% | 14 | 28 |
| complexity_avg | 31 | 18% | 0% | 21 | 11 |
| loc | 38 | 0% | 0% | 34 | 1096 |
| comment_noise | 38 | 0% | 97% | 2 | 1 |
| max_nesting_depth | 38 | 0% | 40% | 5 | 4 |
| parameter_count | 38 | 0% | 29% | 13 | 60 |
| ts_any_usage_count | 38 | 0% | 92% | 3 | 15 |
| ts_ignore_count | 38 | 0% | 100% | 1 | 0 |
| commit_count | 38 | 0% | 66% | 4 | 3 |
| churn_lines | 38 | 0% | 66% | 13 | 315 |
| finding_count | 38 | 0% | 90% | 4 | 30 |
| error_count | 38 | 0% | 100% | 1 | 0 |
| fan_in | 38 | 0% | 13% | 11 | 61 |
| comment_ratio | 38 | 0% | 47% | 21 | 0.60 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 38 | 0.975 | 8/10 | 13/13 |
| complexity × max_nesting_depth | 38 | 0.881 | 7/10 | 22/23 |
| complexity × complexity_avg | 31 | 0.879 | 8/10 | 24/25 |
| ts_any_usage_count × finding_count | 38 | 0.87 | 3/3 | 3/3 |
| complexity × parameter_count | 38 | 0.779 | 6/10 | 23/25 |
| max_nesting_depth × parameter_count | 38 | 0.706 | 6/10 | 20/23 |
| complexity_avg × max_nesting_depth | 31 | 0.704 | 7/10 | 22/23 |
| loc × parameter_count | 38 | 0.701 | 8/10 | 19/25 |
| loc × max_nesting_depth | 38 | 0.664 | 7/10 | 18/23 |
| complexity × loc | 38 | 0.655 | 7/10 | 19/25 |
| max_nesting_depth × churn_lines | 38 | 0.625 | 6/10 | 12/13 |
| max_nesting_depth × commit_count | 38 | 0.6 | 6/10 | 12/13 |

Constant here (correlations undefined): error_count, ts_ignore_count

## ts · function (n=234)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 234 | 0% | 0% | 14 | 28 |
| loc | 234 | 0% | 0% | 52 | 240 |
| comment_noise | 234 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 234 | 0% | 71% | 5 | 4 |
| parameter_count | 234 | 0% | 13% | 5 | 4 |
| comment_ratio | 234 | 0% | 88% | 23 | 0.20 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 234 | 0.63 | 3/10 | 12/25 |
| loc × max_nesting_depth | 234 | 0.592 | 3/10 | 10/25 |
| complexity × loc | 234 | 0.422 | 6/10 | 12/25 |
| loc × comment_ratio | 234 | 0.397 | 1/10 | 6/25 |
| max_nesting_depth × comment_ratio | 234 | 0.397 | 3/10 | 8/25 |
| complexity × comment_ratio | 234 | 0.321 | 0/10 | 8/25 |
| complexity × parameter_count | 234 | 0.084 | 0/10 | 1/25 |
| parameter_count × comment_ratio | 234 | 0.065 | 1/10 | 1/25 |
| max_nesting_depth × parameter_count | 234 | 0.058 | 0/10 | 2/25 |
| loc × parameter_count | 234 | 0.016 | 0/10 | 1/25 |

Constant here (correlations undefined): comment_noise

## tsx · component (n=277)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 277 | 0% | 0% | 13 | 16 |
| loc | 277 | 0% | 0% | 73 | 469 |
| comment_noise | 277 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 277 | 0% | 86% | 4 | 3 |
| parameter_count | 277 | 0% | 8% | 3 | 2 |
| component_loc | 277 | 0% | 0% | 73 | 469 |
| component_hook_count | 277 | 0% | 74% | 15 | 18 |
| component_effect_count | 277 | 0% | 96% | 3 | 2 |
| component_jsx_depth | 277 | 0% | 0% | 11 | 11 |
| component_prop_count | 277 | 0% | 12% | 9 | 8 |
| component_inline_handler_count | 277 | 0% | 83% | 11 | 11 |
| component_jsx_conditional_count | 277 | 0% | 83% | 8 | 10 |
| comment_ratio | 277 | 0% | 92% | 23 | 0.10 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| loc × component_loc | 277 | 1.0 | 10/10 | 25/25 |
| loc × component_jsx_depth | 277 | 0.783 | 6/10 | 16/25 |
| component_loc × component_jsx_depth | 277 | 0.783 | 6/10 | 16/25 |
| complexity × component_jsx_conditional_count | 277 | 0.707 | 6/10 | 16/25 |
| component_hook_count × component_inline_handler_count | 277 | 0.689 | 7/10 | 17/25 |
| max_nesting_depth × component_hook_count | 277 | 0.68 | 5/10 | 18/25 |
| complexity × loc | 277 | 0.664 | 5/10 | 16/25 |
| complexity × component_loc | 277 | 0.664 | 5/10 | 16/25 |
| max_nesting_depth × component_inline_handler_count | 277 | 0.663 | 5/10 | 16/25 |
| component_inline_handler_count × component_jsx_conditional_count | 277 | 0.661 | 6/10 | 13/25 |
| loc × component_inline_handler_count | 277 | 0.616 | 7/10 | 17/25 |
| component_loc × component_inline_handler_count | 277 | 0.616 | 7/10 | 17/25 |

Constant here (correlations undefined): comment_noise

## tsx · file (n=128)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 128 | 0% | 2% | 15 | 16 |
| complexity_avg | 126 | 2% | 0% | 45 | 6 |
| loc | 128 | 0% | 0% | 90 | 727 |
| comment_noise | 128 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 128 | 0% | 64% | 4 | 3 |
| parameter_count | 128 | 0% | 11% | 24 | 51 |
| component_loc | 116 | 9% | 0% | 67 | 469 |
| component_hook_count | 116 | 9% | 49% | 15 | 18 |
| component_effect_count | 116 | 9% | 90% | 3 | 2 |
| component_jsx_depth | 116 | 9% | 0% | 11 | 11 |
| component_prop_count | 116 | 9% | 19% | 9 | 8 |
| component_inline_handler_count | 116 | 9% | 63% | 11 | 11 |
| component_jsx_conditional_count | 116 | 9% | 65% | 8 | 10 |
| ts_any_usage_count | 128 | 0% | 100% | 1 | 0 |
| ts_ignore_count | 128 | 0% | 100% | 1 | 0 |
| commit_count | 128 | 0% | 84% | 3 | 2 |
| churn_lines | 128 | 0% | 84% | 15 | 85 |
| finding_count | 128 | 0% | 89% | 4 | 3 |
| error_count | 128 | 0% | 100% | 1 | 0 |
| fan_in | 128 | 0% | 29% | 16 | 40 |
| comment_ratio | 128 | 0% | 81% | 25 | 0.23 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| commit_count × churn_lines | 128 | 0.995 | 5/10 | 21/21 |
| complexity × complexity_avg | 126 | 0.894 | 2/10 | 15/25 |
| complexity × component_loc | 116 | 0.858 | 7/10 | 21/25 |
| loc × parameter_count | 128 | 0.821 | 8/10 | 18/25 |
| component_loc × component_jsx_depth | 116 | 0.818 | 6/10 | 16/25 |
| component_loc × component_inline_handler_count | 116 | 0.796 | 7/10 | 17/25 |
| component_hook_count × component_inline_handler_count | 116 | 0.786 | 7/10 | 18/25 |
| complexity × component_jsx_conditional_count | 116 | 0.764 | 7/10 | 17/25 |
| complexity × component_inline_handler_count | 116 | 0.736 | 7/10 | 17/25 |
| loc × component_loc | 116 | 0.724 | 8/10 | 17/25 |
| max_nesting_depth × component_hook_count | 116 | 0.719 | 5/10 | 17/25 |
| complexity_avg × component_loc | 116 | 0.717 | 1/10 | 12/25 |

Constant here (correlations undefined): comment_noise, error_count, ts_any_usage_count, ts_ignore_count

## tsx · function (n=530)

| Metric | measured | N/A | zero | distinct | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| complexity | 530 | 0% | 0% | 12 | 14 |
| loc | 530 | 0% | 0% | 55 | 218 |
| comment_noise | 530 | 0% | 100% | 1 | 0 |
| max_nesting_depth | 530 | 0% | 74% | 4 | 3 |
| parameter_count | 530 | 0% | 36% | 5 | 4 |
| comment_ratio | 530 | 0% | 97% | 17 | 0.54 |

| Pair | n | ρ | top-10 shared | top-25 shared |
| --- | ---: | ---: | ---: | ---: |
| complexity × max_nesting_depth | 530 | 0.6 | 1/10 | 9/25 |
| complexity × loc | 530 | 0.588 | 5/10 | 10/25 |
| loc × max_nesting_depth | 530 | 0.546 | 0/10 | 2/25 |
| max_nesting_depth × comment_ratio | 530 | 0.278 | 1/10 | 6/17 |
| loc × comment_ratio | 530 | 0.214 | 0/10 | 1/17 |
| complexity × comment_ratio | 530 | 0.174 | 1/10 | 1/17 |
| loc × parameter_count | 530 | 0.138 | 1/10 | 1/25 |
| complexity × parameter_count | 530 | 0.08 | 0/10 | 2/25 |
| max_nesting_depth × parameter_count | 530 | -0.059 | 0/10 | 1/25 |
| parameter_count × comment_ratio | 530 | -0.051 | 0/10 | 0/17 |

Constant here (correlations undefined): comment_noise
