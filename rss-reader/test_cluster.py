"""Tests for cluster.py — run directly: python3 test_cluster.py"""

import copy

from cluster import cluster_items, find_clusters


def item(id, source, title, summary="", published="2026-07-15T10:00:00Z"):
    return {
        "id": id,
        "source": source,
        "category": "software",
        "title": title,
        "url": f"https://example.com/{id}",
        "published": published,
        "summary": summary,
        "tags": [],
    }


def test_same_story_two_sources_clusters():
    items = [
        item("1", "Hacker News", "OpenAI releases GPT-6"),
        item("2", "TechBlog", "OpenAI releases GPT-6"),
        item("3", "Other", "Completely unrelated clock designs"),
    ]
    clusters = find_clusters(items)
    assert len(clusters) == 1, clusters
    assert {i["id"] for i in clusters[0]} == {"1", "2"}
    out = cluster_items(items)
    assert len(out) == 2
    merged = next(i for i in out if i["related"])
    assert {r["id"] for r in merged["related"]} == {"1", "2"} - {merged["id"]}
    print("ok 1: same story from two sources clusters")


def test_site_suffix_variant_clusters():
    items = [
        item("1", "TechCrunch", "Foo raises $10M | TechCrunch"),
        item("2", "Hacker News", "Foo raises $10M"),
    ]
    out = cluster_items(items)
    assert len(out) == 1, out
    assert len(out[0]["related"]) == 1
    print("ok 2: site-suffix variant clusters")


def test_different_stories_shared_keyword_do_not_cluster():
    items = [
        item("1", "FeedA", "OpenAI releases GPT-6 reasoning model"),
        item("2", "FeedB", "OpenAI faces lawsuit over training data"),
    ]
    out = cluster_items(items)
    assert len(out) == 2, out
    assert all(i["related"] == [] for i in out)
    print("ok 3: different stories sharing one keyword do not cluster")


def test_same_source_near_duplicates_do_not_cluster():
    items = [
        item("1", "Hacker News", "Foo raises $10M"),
        item("2", "Hacker News", "Foo raises $10M"),
    ]
    out = cluster_items(items)
    assert len(out) == 2, out
    assert all(i["related"] == [] for i in out)
    print("ok 4: same-source near-duplicates do not cluster")


def test_representative_is_longest_summary_deterministic():
    items = [
        item("1", "FeedA", "Foo raises $10M", summary="short"),
        item(
            "2",
            "FeedB",
            "Foo raises $10M",
            summary="a much longer summary with actual substance and detail",
        ),
        item("3", "FeedC", "Foo raises $10M", summary="medium length summary"),
    ]
    for _ in range(3):  # stable across runs
        out = cluster_items(items)
        assert len(out) == 1, out
        assert out[0]["id"] == "2", out[0]
        assert {r["id"] for r in out[0]["related"]} == {"1", "3"}
    # Tie on summary length: newest published wins.
    tie = [
        item("1", "FeedA", "Foo raises $10M", summary="same length s", published="2026-07-15T09:00:00Z"),
        item("2", "FeedB", "Foo raises $10M", summary="same length s", published="2026-07-15T11:00:00Z"),
    ]
    out = cluster_items(tie)
    assert out[0]["id"] == "2", out[0]
    print("ok 5: representative selection is deterministic (longest summary wins)")


def test_input_unmutated_and_singletons_have_empty_related():
    items = [
        item("1", "FeedA", "Foo raises $10M", summary="longer summary here"),
        item("2", "FeedB", "Foo raises $10M", summary="short"),
        item("3", "FeedC", "Digital clock designs"),
    ]
    snapshot = copy.deepcopy(items)
    out = cluster_items(items)
    assert items == snapshot  # input list and dicts untouched
    assert out is not items
    assert len(out) == 2
    singleton = next(i for i in out if i["id"] == "3")
    assert singleton["related"] == []
    rep = out[0]
    assert rep["id"] == "1"
    assert rep["related"] == [
        {
            "id": "2",
            "title": "Foo raises $10M",
            "url": "https://example.com/2",
            "source": "FeedB",
            "published": "2026-07-15T10:00:00Z",
        }
    ]
    # Output items are copies: mutating one must not touch the input.
    rep["summary"] = "mutated"
    assert items[0]["summary"] == "longer summary here"
    print("ok 6: input unmutated; singletons carry related == []")


if __name__ == "__main__":
    test_same_story_two_sources_clusters()
    test_site_suffix_variant_clusters()
    test_different_stories_shared_keyword_do_not_cluster()
    test_same_source_near_duplicates_do_not_cluster()
    test_representative_is_longest_summary_deterministic()
    test_input_unmutated_and_singletons_have_empty_related()
    print("\nAll tests passed.")
