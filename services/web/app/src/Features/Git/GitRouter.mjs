import * as GitController from './GitController.mjs'
import AuthorizationMiddleware from '../Authorization/AuthorizationMiddleware.mjs'
import AuthenticationController from '../Authentication/AuthenticationController.mjs'

export default {
  apply(webRouter) {
    // ── Project git operations ──────────────────────────────────────────────
    webRouter.get(
      '/project/:Project_id/git/status',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.getStatus
    )
    webRouter.post(
      '/project/:Project_id/git/configure',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.configureRemote
    )
    webRouter.post(
      '/project/:Project_id/git/commit',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.commitOnly
    )
    webRouter.post(
      '/project/:Project_id/git/push',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.pushOnly
    )
    webRouter.post(
      '/project/:Project_id/git/commit-and-push',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.commitAndPush
    )
    webRouter.post(
      '/project/:Project_id/git/pull',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.pullFromRemote
    )
    webRouter.post(
      '/project/:Project_id/git/migrate',
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      GitController.migrateProject
    )

    // ── SSH key management ─────────────────────────────────────────────────
    webRouter.get(
      '/user/git/ssh-key',
      AuthenticationController.requireLogin(),
      GitController.getSshKeyStatus
    )
    webRouter.post(
      '/user/git/ssh-key',
      AuthenticationController.requireLogin(),
      GitController.uploadSshKey
    )
    webRouter.delete(
      '/user/git/ssh-key',
      AuthenticationController.requireLogin(),
      GitController.deleteSshKey
    )

    // ── Git service integration settings ───────────────────────────────────
    webRouter.get(
      '/user/git/integration',
      AuthenticationController.requireLogin(),
      GitController.getIntegration
    )
    webRouter.post(
      '/user/git/integration',
      AuthenticationController.requireLogin(),
      GitController.saveIntegration
    )
    webRouter.delete(
      '/user/git/integration',
      AuthenticationController.requireLogin(),
      GitController.deleteIntegration
    )
  },
}
