// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import { runMigrations, logger } from "@specific-dev/framework";

runMigrations({ logger })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
