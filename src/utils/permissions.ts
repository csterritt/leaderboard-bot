import { ADMINISTRATOR_PERMISSION } from '../constants'

export const hasAdministratorPermission = (permissions: string): boolean => {
  try {
    return (BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION
  } catch {
    return false
  }
}
