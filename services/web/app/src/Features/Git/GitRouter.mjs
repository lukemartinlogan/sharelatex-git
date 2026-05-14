import * as GitController from './GitController.mjs'
import AuthorizationMiddleware from '../Authorization/AuthorizationMiddleware.mjs'
import AuthenticationController from '../Authentication/AuthenticationController.mjs'

export default {
  apply(webRouter) {
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

    // User-level SSH key management
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
  },
}
