import json
import logging
import string
import time

import zmq
import pytest
import requests
import random
import os

from ..lib.ursadb import UrsaDb


@pytest.fixture(scope="session", autouse=True)
def check_operational(request):
    log = logging.getLogger()

    for attempt in range(60):
        try:
            res = requests.get("http://web:5000/api/backend", timeout=1)
            res.raise_for_status()

            if res.json()["db_alive"]:
                return
            else:
                log.info("Database backend is not active.")
        except requests.exceptions.ConnectionError:
            if attempt % 15 == 0:
                log.info(
                    "Connection to mquery failed, retrying in a moment..."
                )
        except requests.exceptions.RequestException:
            if attempt % 15 == 0:
                log.info("Request to mquery failed, retrying...")

        time.sleep(1)


@pytest.fixture(scope="session", autouse=True)
def add_files_to_index(check_operational):
    num_files = 100
    word_length = 10
    words_list = []

    for i in range(1, num_files):
        words_list.append(
            "".join(
                random.choice(string.ascii_uppercase + string.digits)
                for _ in range(word_length)
            )
        )

    random.shuffle(words_list)
    files_to_detect = words_list[:10]
    clue_words = words_list[:5]

    for i in range(1, 6):
        files_to_detect[i + 4] = (
            files_to_detect[i - 1] + files_to_detect[i + 4]
        )

    all_files = files_to_detect + files_to_detect[10:]
    random.shuffle(all_files)

    num = 0
    for i in all_files:
        num = num + 1
        with open("/mnt/samples/file{0}.txt".format(num), "w") as f:
            f.write(i)

    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.connect("tcp://ursadb:9281")

    socket.send_string(
        'index "/mnt/samples" with [gram3, text4, hash4, wide8];'
    )
    assert json.loads(socket.recv_string()).get("result").get("status") == "ok"

    return {"files_to_detect": files_to_detect, "clue_words": clue_words}


def request_query(log, i, taint=None):
    res = requests.post(
        "http://web:5000/api/query/low",
        json={"method": "query", "raw_yara": i, "taint": taint},
    )
    log.info("API response: %s", res.json())
    res.raise_for_status()

    query_hash = res.json()["query_hash"]

    for j in range(15):
        res = requests.get(
            "http://web:5000/api/matches/{}?offset=0&limit=50".format(
                query_hash
            )
        )
        log.info("API response: %s", res.json())
        if res.json()["job"]["status"] == "done":
            break
        time.sleep(1)

    return res


@pytest.mark.timeout(30)
def test_query_zero_results(add_files_to_index):
    log = logging.getLogger()

    files_to_detect = add_files_to_index["files_to_detect"]
    add_files_to_index["clue_words"]

    yara_tests = []
    for i in files_to_detect[10:]:
        test_yara = """
    rule nymaim {{
        strings:
            $check = "{0}"
        condition:
            any of them
    }}
    """.format(
            i
        )
        yara_tests.append(test_yara)

    for i in yara_tests:
        res = request_query(log, i)

        m = res.json()["matches"]
        assert len(m) == 0


@pytest.mark.timeout(30)
def test_query_one_results(add_files_to_index):
    log = logging.getLogger()

    files_to_detect = add_files_to_index["files_to_detect"]
    clue_words = add_files_to_index["clue_words"]

    yara_tests = []
    without_single_clue_words = set(files_to_detect) - set(clue_words)

    for i in without_single_clue_words:
        test_yara = """
    rule nymaim {{
        strings:
            $check = "{0}"
        condition:
            any of them
    }}
    """.format(
            i
        )
        yara_tests.append(test_yara)

    for i in yara_tests:
        res = request_query(log, i)

        m = res.json()["matches"]
        assert len(m) == 1
        with open(m[0]["file"], "r") as file:
            text = file.read()
        assert text in files_to_detect


@pytest.mark.timeout(30)
def test_query_two_results(add_files_to_index):
    log = logging.getLogger()

    files_to_detect = add_files_to_index["files_to_detect"]
    clue_words = add_files_to_index["clue_words"]

    yara_tests = []
    for i in clue_words:
        test_yara = """
    rule nymaim {{
        strings:
            $check = "{0}"
        condition:
            any of them
    }}
    """.format(
            i
        )
        yara_tests.append(test_yara)

    for i in yara_tests:
        res = request_query(log, i)

        m = res.json()["matches"]
        assert len(m) == 2
        with open(m[0]["file"], "r") as file:
            text1 = file.read()
        with open(m[1]["file"], "r") as file:
            text2 = file.read()
        assert text1 and text2 in files_to_detect


@pytest.mark.timeout(30)
def test_query_with_taints(add_files_to_index):
    log = logging.getLogger()

    # a bit hacky, but this calls for a whole test framework otherwise
    db = UrsaDb("tcp://ursadb:9281")

    dataset_id = db.topology()["result"]["datasets"].keys()[0]
    random_taint = os.urandom(8).hex()

    db.execute_command(f'taint "{dataset_id}" add "{random_taint}')

    files_to_detect = add_files_to_index["files_to_detect"]
    clue_words = add_files_to_index["clue_words"]

    yara_tests = []
    without_single_clue_words = set(files_to_detect) - set(clue_words)

    for i in without_single_clue_words:
        test_yara = """
    rule nymaim {{
        strings:
            $check = "{0}"
        condition:
            any of them
    }}
    """.format(
            i
        )
        yara_tests.append(test_yara)

    for i in yara_tests:
        res = request_query(log, i)
        m = res.json()["matches"]
        assert len(m) == 1
        with open(m[0]["file"], "r") as file:
            text = file.read()
        assert text in files_to_detect

        res = request_query(log, i, "anothertaint")
        m = res.json()["matches"]
        assert len(m) == 0

        res = request_query(log, i, random_taint)
        m = res.json()["matches"]
        assert len(m) == 1
