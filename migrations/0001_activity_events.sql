CREATE TABLE `activity_events` (
  `id` varchar(36) NOT NULL,
  `command` enum('candidate_update','job_search','draft_emails','analyze_recruiter_reply','other') NOT NULL,
  `summary` varchar(500) NOT NULL,
  `source` enum('codex','dashboard') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `activity_events_id` PRIMARY KEY (`id`),
  INDEX `activity_events_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
