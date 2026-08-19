def find_pending_requests(events: list[dict]) -> list[dict]:
    """Return requests that have no recorded model response yet."""
    requests = {}
    completed_request_ids = set()

    for event in events:
        if event["kind"] == "model_request":
            requests[event["request_id"]] = event
        if event["kind"] == "model_response":
            completed_request_ids.add(event["request_id"])

    return [
        request
        for request_id, request in requests.items()
        if request_id not in completed_request_ids
    ]
