export function rewriteLoopbackUrlForStoryboardSource(
  rawUrl: string,
  sourceUrl: string | null | undefined,
) {
  const source = sourceUrl?.trim()
  if (!source) return rawUrl

  let parsedUrl: URL
  let parsedSource: URL
  try {
    parsedUrl = new URL(rawUrl)
    parsedSource = new URL(source)
  } catch {
    return rawUrl
  }

  const isLoopback =
    parsedUrl.hostname === "127.0.0.1" ||
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "0.0.0.0" ||
    parsedUrl.hostname === "[::1]"
  const sourceIsRemote =
    parsedSource.hostname !== "127.0.0.1" &&
    parsedSource.hostname !== "localhost" &&
    parsedSource.hostname !== "0.0.0.0" &&
    parsedSource.hostname !== "[::1]"

  if (!isLoopback || !sourceIsRemote) return rawUrl

  parsedUrl.hostname = parsedSource.hostname
  return parsedUrl.toString()
}

export function rewriteLoopbackUrlsInActionForStoryboardSource(
  action: string,
  sourceUrl: string | null | undefined,
) {
  return action.replace(/https?:\/\/\S+/giu, (match) => {
    const trailing = match.match(/[).,]+$/u)?.[0] ?? ""
    const url = trailing ? match.slice(0, -trailing.length) : match
    return `${rewriteLoopbackUrlForStoryboardSource(url, sourceUrl)}${trailing}`
  })
}
