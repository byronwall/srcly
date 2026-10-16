def mean(values):
    """Return the arithmetic mean of a list of numbers.

    The mean is the sum of the values divided by how many there are.
    This function computes it by summing the values and dividing.
    It returns zero when the list is empty, to avoid dividing by zero.

    Args:
        values: The numbers to average.

    Returns:
        The mean as a float.
    """
    return sum(values) / len(values) if values else 0.0


def total(values):
    result = 0
    # old approach, kept for reference:
    # for v in values:
    #     result = result + v
    # return result
    for v in values:
        result += v
    return result


def explained(values):
    # Start with an empty list of results.
    out = []
    # Walk the input.
    for v in values:
        # Only keep even values.
        if v % 2 == 0:
            # Store it.
            out.append(v)
    # Count them.
    n = len(out)
    # Note: the count is used below.
    # Sum them.
    s = sum(out)
    # Print both for debugging.
    print(n, s)
    # Also print the input size.
    print(len(values))
    # Compute the largest one.
    biggest = max(out) if out else None
    # Print it as well.
    print(biggest)
    # Hand back the list.
    return out
