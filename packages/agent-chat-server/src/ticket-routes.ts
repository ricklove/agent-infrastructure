export function matchTicketStepSelectionRoute(pathname: string) {
  return /^\/api\/agent-chat\/tickets\/([^/]+)\/step-selection$/.exec(pathname)
}

export function matchTicketReassignRoute(pathname: string) {
  return /^\/api\/agent-chat\/tickets\/([^/]+)\/reassign$/.exec(pathname)
}
