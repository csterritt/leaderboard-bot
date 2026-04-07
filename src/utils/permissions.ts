import { ADMINISTRATOR_PERMISSION } from '../constants'

export const hasAdministratorPermission = (permissions: string): boolean =>
  (BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION
