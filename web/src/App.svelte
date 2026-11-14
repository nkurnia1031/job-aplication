<script lang="ts">
  import { onMount } from "svelte";

  type ChatCommand =
    | "candidate_update"
    | "job_search"
    | "draft_emails"
    | "analyze_recruiter_reply"
    | "other";

  interface Activity {
    id: string;
    command: ChatCommand;
    summary: string;
    source: "codex" | "dashboard";
    createdAt: string;
  }

  type FactState = "current" | "conflict_pending" | "superseded" | "rejected";
  type FactSupport = "supported" | "unverified";

  interface CandidateSourceReference {
    id: string;
    sourceKey: string;
    versionNumber: number;
    kind: string;
    title: string;
    originalFileName: string;
    mediaType: string;
    createdAt: string;
  }

  interface CandidateFactVersion {
    id: string;
    factId: string;
    factKey: string;
    versionNumber: number;
    statement: string;
    evidenceExcerpt: string | null;
    supportStatus: FactSupport;
    state: FactState;
    createdAt: string;
    resolvedAt: string | null;
    source: CandidateSourceReference;
  }

  interface CandidateFactHistory {
    factId: string;
    factKey: string;
    versions: CandidateFactVersion[];
  }

  interface CandidateSourceEntry extends CandidateSourceReference {
    originalFileName: string;
    mediaType: string;
  }

  const commandLabels: Record<ChatCommand, string> = {
    candidate_update: "Pembaruan profil",
    job_search: "Pencarian lowongan",
    draft_emails: "Draf lamaran",
    analyze_recruiter_reply: "Analisis balasan",
    other: "Perintah lainnya",
  };

  let activities = $state<Activity[]>([]);
  let candidateFacts = $state<CandidateFactHistory[]>([]);
  let candidateSources = $state<CandidateSourceEntry[]>([]);
  let loading = $state(true);
  let bankLoading = $state(true);
  let error = $state("");
  let bankError = $state("");
  let refreshedAt = $state<Date | null>(null);

  async function refreshActivities() {
    loading = true;
    error = "";
    try {
      const response = await fetch("/api/activities?limit=50");
      if (!response.ok) throw new Error("Data aktivitas belum dapat dimuat.");
      const result = (await response.json()) as { activities: Activity[] };
      activities = result.activities;
      refreshedAt = new Date();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Terjadi kesalahan saat memuat aktivitas.";
    } finally {
      loading = false;
    }
  }

  async function refreshCandidateBank() {
    bankLoading = true;
    bankError = "";
    try {
      const response = await fetch("/api/candidate-bank");
      if (!response.ok) throw new Error("Bank kandidat belum dapat dimuat.");
      const result = (await response.json()) as {
        facts: CandidateFactHistory[];
        sources: CandidateSourceEntry[];
      };
      candidateFacts = result.facts;
      candidateSources = result.sources;
    } catch (caught) {
      bankError = caught instanceof Error ? caught.message : "Terjadi kesalahan saat memuat bank kandidat.";
    } finally {
      bankLoading = false;
    }
  }

  async function refreshAll() {
    await Promise.all([refreshActivities(), refreshCandidateBank()]);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  onMount(() => {
    void refreshAll();
  });
</script>

<svelte:head>
  <meta name="description" content="Dashboard baca saja untuk riwayat kerja yang dikelola melalui Codex." />
</svelte:head>

<main class="page-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Ruang Kerja beranda">
      <span class="brand-mark" aria-hidden="true">rk</span>
      <span>ruang kerja<span class="brand-period">.</span></span>
    </a>
    <span class="connection"><span class="connection-dot"></span>Pribadi · lokal</span>
  </header>

  <section class="intro" aria-labelledby="page-title">
    <div class="eyebrow"><span class="eyebrow-line"></span>PERSONAL JOB SEARCH</div>
    <div class="intro-row">
      <div>
        <h1 id="page-title">Ruang kendali<span class="title-period">.</span></h1>
        <p class="intro-copy">Riwayat dan perkembangan pencarian kerjamu, tersimpan di satu tempat.</p>
      </div>
      <button class="refresh-button" onclick={refreshAll} disabled={loading || bankLoading}>
        <span class:spinning={loading || bankLoading} aria-hidden="true">↻</span>
        Perbarui
      </button>
    </div>
  </section>

  <section class="candidate-section" aria-labelledby="candidate-title">
    <div class="section-heading">
      <div>
        <div class="eyebrow section-kicker">BANK PEMAHAMAN</div>
        <h2 id="candidate-title">Fakta kandidat</h2>
      </div>
      <span class="count-pill">{candidateFacts.length.toString().padStart(2, "0")} fakta</span>
    </div>

    {#if bankLoading && candidateFacts.length === 0}
      <div class="empty-card" aria-live="polite">
        <span class="loading-mark" aria-hidden="true">···</span>
        <p>Memuat fakta dan sumber</p>
      </div>
    {:else if bankError}
      <div class="empty-card error-card" role="alert">
        <p>{bankError}</p>
        <button class="text-button" onclick={refreshCandidateBank}>Coba lagi</button>
      </div>
    {:else if candidateFacts.length === 0 && candidateSources.length === 0}
      <div class="empty-card">
        <span class="empty-icon" aria-hidden="true">⌁</span>
        <h3>Bank kandidat masih kosong</h3>
        <p>Minta Codex menganalisis berkas atau menyimpan pembaruan pengalaman untuk mulai membangun fakta bersumber.</p>
      </div>
    {:else}
      {#if candidateFacts.length === 0}
        <div class="empty-card source-only-card">
          <h3>Sumber tersimpan, belum ada fakta</h3>
          <p>Perintahkan Codex menganalisis sumber ini untuk menyusun fakta dengan bukti dan asal yang jelas.</p>
        </div>
      {/if}

      {#if candidateFacts.length > 0}
      <div class="candidate-list">
        {#each candidateFacts as fact (fact.factId)}
          {@const current = fact.versions.find((version) => version.state === "current")}
          {@const pending = fact.versions.filter((version) => version.state === "conflict_pending")}
          <article class="candidate-card">
            <div class="candidate-card-heading">
              <span class="fact-key">{fact.factKey}</span>
              {#if current}
                <span class="fact-badge" class:supported={current.supportStatus === "supported"} class:unverified={current.supportStatus === "unverified"}>
                  {current.supportStatus === "supported" ? "Didukung sumber" : "Belum terverifikasi"}
                </span>
              {/if}
            </div>

            {#if current}
              <p class="fact-statement">{current.statement}</p>
              <div class="source-row">
                <a class="source-link" href={`/api/candidate-sources/${current.source.id}/file`}>
                  <span class="source-glyph" aria-hidden="true">↗</span>
                  <span>{current.source.title}</span>
                  <span class="source-version">v{current.source.versionNumber}</span>
                </a>
                <span class="source-kind">{current.source.kind.replaceAll("_", " ")}</span>
              </div>
              {#if current.evidenceExcerpt}
                <blockquote class="evidence-quote">“{current.evidenceExcerpt}”</blockquote>
              {/if}
            {/if}

            {#each pending as proposed (proposed.id)}
              <div class="conflict-callout">
                <span class="conflict-tag">Perlu konfirmasi di chat Codex</span>
                <p>{proposed.statement}</p>
                <span class="conflict-source">Sumber: {proposed.source.title} · v{proposed.source.versionNumber}</span>
              </div>
            {/each}

            <details class="version-details">
              <summary>Riwayat versi <span>{fact.versions.length}</span></summary>
              <div class="version-list">
                {#each fact.versions as version (version.id)}
                  <div class="version-row">
                    <div class="version-topline">
                      <span class="version-number">v{version.versionNumber}</span>
                      <span class="state-badge" class:state-current={version.state === "current"} class:state-pending={version.state === "conflict_pending"}>
                        {version.state === "current" ? "Aktif" : version.state === "conflict_pending" ? "Konflik" : version.state === "rejected" ? "Ditolak" : "Digantikan"}
                      </span>
                      <span class="version-date">{formatDate(version.createdAt)}</span>
                    </div>
                    <p>{version.statement}</p>
                    <a class="version-source" href={`/api/candidate-sources/${version.source.id}/file`}>
                      {version.source.title} · sumber v{version.source.versionNumber}
                    </a>
                    {#if version.evidenceExcerpt}
                      <span class="version-evidence">Bukti: “{version.evidenceExcerpt}”</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          </article>
        {/each}
      </div>
      {/if}

      {#if candidateSources.length > 0}
        <div class="source-catalog">
          <div class="catalog-heading">
            <h3>Sumber asli</h3>
            <span>{candidateSources.length} versi</span>
          </div>
          <div class="source-catalog-list">
            {#each candidateSources as source (source.id)}
              <article class="source-catalog-row">
                <span class="catalog-file-mark" aria-hidden="true">▤</span>
                <div class="catalog-file-info">
                  <strong>{source.title}</strong>
                  <span>{source.originalFileName} · {source.sourceKey} · v{source.versionNumber}</span>
                </div>
                <a class="download-link" href={`/api/candidate-sources/${source.id}/file`}>Buka</a>
              </article>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </section>

  <section class="activity-section" aria-labelledby="activity-title">
    <div class="section-heading">
      <div>
        <div class="eyebrow section-kicker">CATATAN TERBARU</div>
        <h2 id="activity-title">Aktivitas</h2>
      </div>
      <span class="count-pill">{activities.length.toString().padStart(2, "0")} catatan</span>
    </div>

    {#if loading && activities.length === 0}
      <div class="empty-card" aria-live="polite">
        <span class="loading-mark" aria-hidden="true">···</span>
        <p>Memuat catatan aktivitas</p>
      </div>
    {:else if error}
      <div class="empty-card error-card" role="alert">
        <p>{error}</p>
        <button class="text-button" onclick={refreshActivities}>Coba lagi</button>
      </div>
    {:else if activities.length === 0}
      <div class="empty-card">
        <span class="empty-icon" aria-hidden="true">↗</span>
        <h3>Belum ada aktivitas</h3>
        <p>Setelah kamu memberi perintah lewat chat Codex, catatannya akan muncul di sini.</p>
      </div>
    {:else}
      <div class="activity-list">
        {#each activities as activity (activity.id)}
          <article class="activity-row">
            <div class="activity-symbol" aria-hidden="true">{activity.command === "job_search" ? "⌕" : activity.command === "draft_emails" ? "✉" : "↗"}</div>
            <div class="activity-main">
              <div class="activity-meta">
                <span class="activity-type">{commandLabels[activity.command]}</span>
                <span class="meta-separator">·</span>
                <time datetime={activity.createdAt}>{formatDate(activity.createdAt)}</time>
              </div>
              <p>{activity.summary}</p>
            </div>
            <span class="source-label">{activity.source === "codex" ? "CODEX" : "DASHBOARD"}</span>
          </article>
        {/each}
      </div>
    {/if}

    {#if refreshedAt && !loading}
      <p class="refresh-note">Diperbarui {new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(refreshedAt)}</p>
    {/if}
  </section>

  <footer class="footer">
    <span class="footer-rule"></span>
    <p>Data hanya dapat diperbarui melalui chat Codex atau aksi yang disetujui.</p>
    <span class="footer-lock" aria-label="Lokal dan privat">◈</span>
  </footer>
</main>
