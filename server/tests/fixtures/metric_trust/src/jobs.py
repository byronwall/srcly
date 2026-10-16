"""Fixture for tests/test_metric_trust.py: nested functions and a class."""


def schedule(jobs, retries):
    def backoff(attempt):
        if attempt > 3:
            return 60
        if attempt > 2:
            return 30
        if attempt > 1:
            return 10
        return 1

    for job in jobs:
        if job.done:
            continue
        job.wait = backoff(retries)
    return jobs


class Queue:
    def push(self, job):
        self.items.append(job)

    def pop(self):
        if not self.items:
            return None
        return self.items.pop()
