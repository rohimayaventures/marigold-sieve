// Written by `node cli.js eval` with REAL results only. Mock runs never overwrite this file.
export default {
  "status": "ok",
  "mock": false,
  "ran_at": "2026-10-08T00:25:40.824Z",
  "cheap_model": "claude-haiku-4-5-20251001",
  "strong_model": "claude-sonnet-5-5",
  "violations_caught": 13,
  "violations_total": 15,
  "false_positives": 0,
  "clean_total": 5,
  "planted_rules_found": 21,
  "planted_rules_total": 24,
  "escalated": 1,
  "routed_to_strong": 1,
  "avg_cost_usd": 0.002416,
  "cost_per_1000_ads_usd": 2.42,
  "avg_latency_ms": 1915,
  "rows": [
    {
      "id": "T01",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.98,
      "planted": [
        "R1",
        "R9"
      ],
      "found": [
        "R1",
        "R2",
        "R9"
      ],
      "correct": true,
      "cost": 0.00266,
      "ms": 3383
    },
    {
      "id": "T02",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R2",
        "R5"
      ],
      "found": [
        "R2",
        "R5"
      ],
      "correct": true,
      "cost": 0.00267,
      "ms": 3420
    },
    {
      "id": "T03",
      "expected": "flag",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R6"
      ],
      "found": [],
      "correct": false,
      "cost": 0.001255,
      "ms": 984
    },
    {
      "id": "T04",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R4",
        "R5"
      ],
      "found": [
        "R4",
        "R1",
        "R5"
      ],
      "correct": true,
      "cost": 0.002397,
      "ms": 2691
    },
    {
      "id": "T05",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R5"
      ],
      "found": [
        "R5"
      ],
      "correct": true,
      "cost": 0.001742,
      "ms": 1587
    },
    {
      "id": "T06",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R3"
      ],
      "found": [
        "R3"
      ],
      "correct": true,
      "cost": 0.001859,
      "ms": 1625
    },
    {
      "id": "T07",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R8"
      ],
      "found": [
        "R8"
      ],
      "correct": true,
      "cost": 0.001782,
      "ms": 1492
    },
    {
      "id": "T08",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.92,
      "planted": [
        "R7"
      ],
      "found": [
        "R7",
        "R2"
      ],
      "correct": true,
      "cost": 0.002336,
      "ms": 2720
    },
    {
      "id": "T09",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.99,
      "planted": [
        "R9"
      ],
      "found": [
        "R9"
      ],
      "correct": true,
      "cost": 0.001915,
      "ms": 1586
    },
    {
      "id": "T10",
      "expected": "flag",
      "got": "escalate",
      "model": "claude-sonnet-5-5",
      "routed": true,
      "confidence": 0.95,
      "planted": [
        "ESCALATE"
      ],
      "found": [
        "ESCALATE",
        "R3",
        "R5"
      ],
      "correct": true,
      "cost": 0.012837,
      "ms": 5300
    },
    {
      "id": "T11",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R2",
        "ESCALATE"
      ],
      "found": [
        "R2"
      ],
      "correct": true,
      "cost": 0.00183,
      "ms": 1685
    },
    {
      "id": "T12",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.99,
      "planted": [
        "R1"
      ],
      "found": [
        "R1"
      ],
      "correct": true,
      "cost": 0.00184,
      "ms": 1628
    },
    {
      "id": "T13",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R7",
        "R3",
        "R6",
        "R5"
      ],
      "found": [
        "R7",
        "R1",
        "R3",
        "R5",
        "R6"
      ],
      "correct": true,
      "cost": 0.003235,
      "ms": 3911
    },
    {
      "id": "T14",
      "expected": "flag",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.92,
      "planted": [
        "ESCALATE"
      ],
      "found": [],
      "correct": false,
      "cost": 0.001221,
      "ms": 625
    },
    {
      "id": "T15",
      "expected": "flag",
      "got": "fix",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [
        "R8",
        "R1",
        "R9"
      ],
      "found": [
        "R1",
        "R8",
        "R9"
      ],
      "correct": true,
      "cost": 0.002528,
      "ms": 2481
    },
    {
      "id": "C01",
      "expected": "pass",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.98,
      "planted": [],
      "found": [],
      "correct": true,
      "cost": 0.001246,
      "ms": 674
    },
    {
      "id": "C02",
      "expected": "pass",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.98,
      "planted": [],
      "found": [],
      "correct": true,
      "cost": 0.001241,
      "ms": 637
    },
    {
      "id": "C03",
      "expected": "pass",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.98,
      "planted": [],
      "found": [],
      "correct": true,
      "cost": 0.001256,
      "ms": 659
    },
    {
      "id": "C04",
      "expected": "pass",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.98,
      "planted": [],
      "found": [],
      "correct": true,
      "cost": 0.001232,
      "ms": 562
    },
    {
      "id": "C05",
      "expected": "pass",
      "got": "pass",
      "model": "claude-haiku-4-5-20251001",
      "routed": false,
      "confidence": 0.95,
      "planted": [],
      "found": [],
      "correct": true,
      "cost": 0.001238,
      "ms": 657
    }
  ]
};
