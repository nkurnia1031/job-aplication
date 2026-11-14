CREATE TABLE `candidate_sources` (
  `id` varchar(36) NOT NULL,
  `source_key` varchar(191) NOT NULL,
  `version_number` int unsigned NOT NULL,
  `kind` enum('cv','portfolio','supporting_document','experience_update','other') NOT NULL,
  `title` varchar(255) NOT NULL,
  `original_file_name` varchar(255) NOT NULL,
  `media_type` varchar(100) NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `storage_key` varchar(512) NOT NULL,
  `extracted_text` mediumtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `candidate_sources_id` PRIMARY KEY (`id`),
  UNIQUE KEY `candidate_sources_key_version_uq` (`source_key`, `version_number`),
  KEY `candidate_sources_sha256_idx` (`sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `candidate_facts` (
  `id` varchar(36) NOT NULL,
  `fact_key` varchar(191) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `candidate_facts_id` PRIMARY KEY (`id`),
  UNIQUE KEY `candidate_facts_fact_key_uq` (`fact_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `candidate_fact_versions` (
  `id` varchar(36) NOT NULL,
  `fact_id` varchar(36) NOT NULL,
  `version_number` int unsigned NOT NULL,
  `subject` varchar(191) NOT NULL,
  `predicate` varchar(191) NOT NULL,
  `object_value` varchar(255) NOT NULL,
  `statement` varchar(1000) NOT NULL,
  `evidence_excerpt` varchar(1000),
  `support_status` enum('supported','unverified') NOT NULL,
  `state` enum('current','conflict_pending','superseded','rejected') NOT NULL,
  `source_id` varchar(36) NOT NULL,
  `conflicts_with_version_id` varchar(36),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `candidate_fact_versions_id` PRIMARY KEY (`id`),
  UNIQUE KEY `candidate_fact_versions_fact_version_uq` (`fact_id`, `version_number`),
  KEY `candidate_fact_versions_fact_state_idx` (`fact_id`, `state`),
  KEY `candidate_fact_versions_source_idx` (`source_id`),
  CONSTRAINT `candidate_fact_versions_fact_fk` FOREIGN KEY (`fact_id`) REFERENCES `candidate_facts` (`id`),
  CONSTRAINT `candidate_fact_versions_source_fk` FOREIGN KEY (`source_id`) REFERENCES `candidate_sources` (`id`),
  CONSTRAINT `candidate_fact_versions_conflict_fk` FOREIGN KEY (`conflicts_with_version_id`) REFERENCES `candidate_fact_versions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
