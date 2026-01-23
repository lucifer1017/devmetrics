import { Octokit } from '@octokit/rest';
import { GitHubMetrics } from '../types';

export class GitHubService {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    try {
      // Fetch repository info
      const { data: repoData } = await this.octokit.repos.get({
        owner,
        repo,
      });

      // Fetch commits
      const { data: commits } = await this.octokit.repos.listCommits({
        owner,
        repo,
        per_page: 1,
      });

      // Fetch open issues
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 1,
      });

      // Fetch open pull requests count
      const { data: pullRequests } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 1,
      });

      // Get total counts
      const issuesCount = repoData.open_issues_count || 0;
      
      // Get PR count from search API (more accurate)
      let prsCount = 0;
      try {
        const { data: prSearch } = await this.octokit.search.issuesAndPullRequests({
          q: `repo:${owner}/${repo} type:pr state:open`,
          per_page: 1,
        });
        prsCount = prSearch.total_count || 0;
      } catch {
        // Fallback to basic count
        prsCount = pullRequests.length;
      }

      // Get contributors count
      let contributorsCount = 0;
      try {
        const { data: contributors } = await this.octokit.repos.listContributors({
          owner,
          repo,
          per_page: 1,
        });
        // Use pagination to get total count
        if (contributors.length > 0) {
          // Make a request with per_page=1 to get the total from Link header
          const response = await this.octokit.repos.listContributors({
            owner,
            repo,
            per_page: 1,
          });
          // Try to get a larger sample to estimate
          const { data: allContributors } = await this.octokit.repos.listContributors({
            owner,
            repo,
            per_page: 100,
          });
          contributorsCount = allContributors.length;
          // If we got 100, there might be more, but we'll use this as an estimate
        }
      } catch {
        contributorsCount = 0;
      }

      return {
        stars: repoData.stargazers_count || 0,
        lastCommitDate: commits[0]?.commit.committer?.date || null,
        openIssuesCount: issuesCount,
        pullRequestsCount: prsCount,
        contributorCount: contributorsCount,
        repository: `${owner}/${repo}`,
      };
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found`);
      }
      if (error.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN.');
      }
      throw new Error(`Failed to fetch GitHub metrics: ${error.message}`);
    }
  }

}
