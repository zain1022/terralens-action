import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
const TERRALENS_API_URL =
  process.env.TERRALENS_API_URL ||
  "https://terralens-backend-production.up.railway.app";
const PR_COMMENT_MARKER = "<!-- terralens-pr-comment -->";
interface TerraLensResponse {
  summary: { toAdd: number; toChange: number; toDestroy: number };
  aiExplanation: {
    riskLevel?: string;
    totalMonthlyCostDelta?: number;
    safeToApply?: boolean;
    tier?: string;
  };
  markdownComment: string;
  repo: string;
  prNumber: number | null;
  tier: string;
}
async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api-key");
    const planFile = core.getInput("plan-file", { required: true });
    const githubToken = core.getInput("github-token", { required: true });
    const format = core.getInput("format"); // optional: "json" | "text"; empty = backend auto-detects
    if (!fs.existsSync(planFile)) {
      core.setFailed(`Plan file not found at path: ${planFile}`);
      return;
    }
    const planText = fs.readFileSync(planFile, "utf8");
    if (planText.trim().length < 50) {
      core.setFailed(
        "Plan file is too short. Make sure your terraform plan output was written successfully.",
      );
      return;
    }
    const { owner, repo } = github.context.repo;
    const repoIdentifier = `${owner}/${repo}`;
    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning(
        "This Action is designed to run on pull_request events. No PR number was found in context — running analysis only, no comment will be posted.",
      );
    }
    core.info(`Analyzing plan for ${repoIdentifier} (PR #${prNumber || "n/a"})...`);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${TERRALENS_API_URL}/api/analyze-pr`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        planText,
        repo: repoIdentifier,
        prNumber: prNumber || null,
        ...(format ? { format } : {}),
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorCode = errorBody?.error || "unknown_error";
      const errorMessage =
        errorBody?.message ||
        `TerraLens API returned ${response.status} ${response.statusText}`;
      if (errorCode === "repo_limit_reached") {
        core.setFailed(
          `${errorMessage}\n\nThis repository has hit the free tier limit of 5 PR analyses per month. Upgrade to Pro at https://terralens.io/pricing and pass your API key via the 'api-key' input.`,
        );
      } else if (errorCode === "invalid_api_key") {
        core.setFailed(
          "The provided API key is invalid or has been revoked. Generate a new one at https://terralens.io/account.",
        );
      } else {
        core.setFailed(errorMessage);
      }
      return;
    }
    const result = (await response.json()) as TerraLensResponse;
    core.info(`Analysis complete. Risk level: ${result.aiExplanation.riskLevel || "none"}`);
    core.info(`Estimated cost impact: $${result.aiExplanation.totalMonthlyCostDelta || 0}/mo`);
    core.setOutput("risk-level", result.aiExplanation.riskLevel || "none");
    core.setOutput("cost-delta", result.aiExplanation.totalMonthlyCostDelta ?? 0);
    core.setOutput("safe-to-apply", result.aiExplanation.safeToApply ?? false);
    if (prNumber) {
      const octokit = github.getOctokit(githubToken);
      const commentBody = `${PR_COMMENT_MARKER}\n${result.markdownComment}`;
      const existingComments = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      });
      const existingComment = existingComments.data.find((c) =>
        c.body?.includes(PR_COMMENT_MARKER),
      );
      if (existingComment) {
        core.info(`Updating existing TerraLens comment (id: ${existingComment.id})`);
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: commentBody,
        });
      } else {
        core.info("Posting new TerraLens comment on PR");
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: commentBody,
        });
      }
    }
    const failOnCritical = core.getBooleanInput("fail-on-critical") ?? false;
    if (failOnCritical && result.aiExplanation.riskLevel === "critical") {
      core.setFailed(
        "Critical risks detected. Review the PR comment and resolve before merging.",
      );
    }
  } catch (err) {
    core.setFailed(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
run();
