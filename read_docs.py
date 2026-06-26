import os
import re
import json

files = [
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\data-pagination.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\data-upsert.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\lock-advisory.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\lock-deadlock-prevention.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\lock-short-transactions.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\lock-skip-locked.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\monitor-explain-analyze.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\monitor-pg-stat-statements.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\monitor-vacuum-analyze.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\query-composite-indexes.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\query-covering-indexes.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\query-index-types.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\query-missing-indexes.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\query-partial-indexes.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-constraints.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-data-types.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-foreign-key-indexes.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-lowercase-identifiers.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-partitioning.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\schema-primary-keys.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\security-privileges.md",
    r"C:\Users\User\Desktop\My Learning\UniMarket_v2\.agents\skills\supabase-postgres-best-practices\references\security-rls-basics.md"
]

for f in files:
    name = os.path.basename(f)
    print(f"=== {name} ===")
    if not os.path.exists(f):
        print("Does not exist!")
        continue
    with open(f, "r", encoding="utf-8") as file:
        content = file.read()
        print(content)
        print("\n" + "="*40 + "\n")
