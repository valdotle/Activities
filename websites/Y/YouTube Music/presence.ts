import { ActivityType, Assets, getTimestamps, timestampFromFormat } from 'premid'

const presence = new Presence({
  clientId: '463151177836658699',
})

enum ActivityAssets {
  Logo = 'https://cdn.rcd.gg/PreMiD/websites/Y/YouTube%20Music/assets/logo.png',
  SmallLogo = `https://cdn.rcd.gg/PreMiD/websites/Y/YouTube%20Music/assets/0.png`,
}

/*const StatusDisplayTypes: Map<String, StatusDisplayType> = new Map([
  ["Artist", StatusDisplayType.State],
  ["YouTube Music", StatusDisplayType.Name],
  ["Title", StatusDisplayType.Details]],
)*/

enum StatusDisplayTypes {
  Artist,
  Title,
  Website,
}

let prevTitleAuthor = ''
let presenceData: PresenceData
let mediaTimestamps: [number, number]
let oldPath: string
let startTimestamp: number
let videoListenerAttached = false
let useTimeLeftChanged = false
let prevAlbum = ''

presence.on('UpdateData', async () => {
  const { pathname, search, href } = document.location
  const [
    showButtons,
    showTimestamps,
    showCover,
    showPaused,
    showBrowsing,
    privacyMode,
    useTimeLeft,
    hideYTM,
    activityDisplay
  ] = await Promise.all([
    presence.getSetting<boolean>('buttons'),
    presence.getSetting<boolean>('timestamps'),
    presence.getSetting<boolean>('cover'),
    presence.getSetting<boolean>('showPaused'),
    presence.getSetting<boolean>('browsing'),
    presence.getSetting<boolean>('privacy'),
    presence.getSetting<boolean>('useTimeLeft'),
    presence.getSetting<boolean>('hideYTM'),
    presence.getSetting<StatusDisplayTypes>('activityDisplay'),
  ])
  const { mediaSession } = navigator
  const watchID = href.match(/v=([^&#]{5,})/)?.[1]
    ?? document
      .querySelector<HTMLAnchorElement>('a.ytp-title-link.yt-uix-sessionlink')
      ?.href
      .match(/v=([^&#]{5,})/)?.[1]
  const repeatMode = document
    .querySelector('ytmusic-player-bar[slot="player-bar"]')
    ?.getAttribute('repeat-mode')
  const videoElement = document.querySelector<HTMLMediaElement>('.video-stream')
  const titleUrl = `https://music.youtube.com/watch?v=${watchID}`

  if (useTimeLeftChanged !== useTimeLeft && !privacyMode) {
    useTimeLeftChanged = useTimeLeft
    updateSongTimestamps(useTimeLeft)
  }

  if (videoElement && !privacyMode) {
    if (!videoListenerAttached) {
      //* If video scrobbled, update timestamps
      videoElement.addEventListener('seeked', () =>
        updateSongTimestamps(useTimeLeft))
      //* If video resumes playing, update timestamps
      videoElement.addEventListener('play', () =>
        updateSongTimestamps(useTimeLeft))

      videoListenerAttached = true
    }
    //* Element got removed from the DOM (eg, song with song/video switch)
  }
  else {
    prevTitleAuthor = ''
    videoListenerAttached = false
  }

  presenceData = {}

  if (!showPaused && mediaSession?.playbackState !== 'playing')
    return presence.clearActivity()

  if (['playing', 'paused'].includes(mediaSession?.playbackState)) {
    if (privacyMode) {
      return presence.setActivity({
        type: ActivityType.Listening,
        largeImageKey: ActivityAssets.Logo,
      })
    }

    if (!mediaSession?.metadata?.title || Number.isNaN(videoElement?.duration ?? Number.NaN))
      return

    if (
      prevTitleAuthor
      !== mediaSession.metadata.title
      + mediaSession.metadata.artist
      + document
        .querySelector<HTMLSpanElement>('#left-controls > span')
        ?.textContent
        ?.trim()
    ) {
      updateSongTimestamps(useTimeLeft)

      if (mediaTimestamps[0] === mediaTimestamps[1])
        return

      prevTitleAuthor = mediaSession.metadata.title
        + mediaSession.metadata.artist
        + document
          .querySelector<HTMLSpanElement>('#left-controls > span')
          ?.textContent
          ?.trim()
    }


    if ([...document.querySelectorAll<HTMLAnchorElement>('.byline a')]?.length > 0) {

    }

    const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.byline a')]

    const [artistLink, albumLink] = [navLinks?.at(0)?.href, navLinks?.length > 1 ? navLinks?.at(-1)?.href : undefined]

    if (albumLink && albumLink !== prevAlbum) {
      prevAlbum = albumLink
    }

    const buttons: [ButtonData, ButtonData?] = [
      {
        label: 'Listen Along',
        url: titleUrl,
      },
    ]

    if (artistLink && activityDisplay === StatusDisplayTypes.Artist) {
      buttons.push({
        label: `View Artist`,
        url: artistLink,
      })
    } else if (albumLink && activityDisplay !== StatusDisplayTypes.Artist) {
      buttons.push({
        label: `View Album`,
        url: albumLink,
      })
    }

    presenceData = {
      type: ActivityType.Listening,
      name: activityDisplay === StatusDisplayTypes.Artist ? mediaSession.metadata.artist : activityDisplay === StatusDisplayTypes.Title ? mediaSession.metadata.title : 'YouTube Music',
      details: activityDisplay === StatusDisplayTypes.Title ? mediaSession.metadata.artist : mediaSession.metadata.title,
      state: activityDisplay === StatusDisplayTypes.Website ? `by ${mediaSession.metadata.artist}` : mediaSession.metadata.album ? `on ${mediaSession.metadata.album}` : null,
      ...(((activityDisplay === StatusDisplayTypes.Website && mediaSession.metadata.album) || (activityDisplay !== StatusDisplayTypes.Website && !showCover)) && {
        largeImageText: activityDisplay === StatusDisplayTypes.Website ? `on ${mediaSession.metadata.album}` : 'with YouTube Music'
      }),
      ...(showButtons && {
        buttons,
      }),
      //statusDisplayType: StatusDisplayType.Details,
      detailsUrl: activityDisplay !== StatusDisplayTypes.Title ? titleUrl : artistLink,
      ...((albumLink || activityDisplay === StatusDisplayTypes.Website) && { stateUrl: activityDisplay === StatusDisplayTypes.Website ? artistLink : albumLink }),
      largeImageKey: showCover
        ? mediaSession?.metadata?.artwork?.at(-1)?.src
        ?? ActivityAssets.Logo
        : ActivityAssets.Logo,
      ...(mediaSession.playbackState === 'paused'
        || (repeatMode && repeatMode !== 'NONE')
        ? {
          smallImageKey: mediaSession.playbackState === 'paused'
            ? Assets.Pause
            : repeatMode === 'ONE'
              ? Assets.RepeatOne
              : Assets.Repeat,
          smallImageText: mediaSession.playbackState === 'paused'
            ? 'Paused'
            : repeatMode === 'ONE'
              ? 'On loop'
              : 'Playlist on loop',
        }
        : showCover && !hideYTM ? { smallImageKey: ActivityAssets.SmallLogo, smallImageText: activityDisplay !== StatusDisplayTypes.Website ? 'YouTube Music' : null } : null),
      ...(showTimestamps
        && mediaSession.playbackState === 'playing' && {
        startTimestamp: mediaTimestamps[0],
        endTimestamp: mediaTimestamps[1],
      }),
    }
  }
  else if (showBrowsing) {
    if (privacyMode) {
      return presence.setActivity({
        largeImageKey: ActivityAssets.Logo,
        details: 'Browsing YouTube Music',
      })
    }

    if (oldPath !== pathname) {
      oldPath = pathname
      startTimestamp = Math.floor(Date.now() / 1000)
    }

    presenceData = {
      type: ActivityType.Playing,
      largeImageKey: ActivityAssets.Logo,
      details: 'Browsing',
      startTimestamp,
    }

    if (pathname === '/')
      presenceData.details = 'Browsing Home'

    if (pathname === '/explore')
      presenceData.details = 'Browsing Explore'

    if (pathname.startsWith('/library')) {
      presenceData.details = 'Browsing Library'
      presenceData.state = document.querySelector(
        '#tabs .iron-selected .tab',
      )?.textContent
    }

    if (pathname.startsWith('/playlist')) {
      presenceData.details = 'Browsing Playlist'

      if (search === '?list=LM') {
        presenceData.state = 'Liked Music'
      }
      else {
        presenceData.state = document.querySelector('#contents > ytmusic-responsive-header-renderer > h1 > yt-formatted-string')?.textContent
        presenceData.stateUrl = href

        presenceData.buttons = [
          {
            label: 'Show Playlist',
            url: href,
          },
        ]
      }

      presenceData.largeImageKey = document.querySelector<HTMLImageElement>('.thumbnail >.image > img')?.src
      presenceData.smallImageKey = ActivityAssets.SmallLogo
    }

    if (pathname.startsWith("/search")) {
      presenceData.details = 'Searching'
      presenceData.state = document.querySelector<HTMLInputElement>(
        '.search-container input',
      )?.value

      presenceData.buttons = [
        {
          label: 'View Search',
          url: href,
        },
      ]
    }

    if (pathname.startsWith("/channel")) {
      presenceData.details = 'Browsing Channel'
      presenceData.state = document.querySelector('#header .title')?.textContent

      presenceData.buttons = [
        {
          label: 'Show Channel',
          url: href,
        },
      ]
    }

    if (pathname.match("/new_releases")) {
      presenceData.details = 'Browsing New Releases'

      presenceData.buttons = [
        {
          label: 'Show New Releases',
          url: href,
        },
      ]
    }

    if (pathname.startsWith("/charts")) {
      presenceData.details = 'Browsing Charts'

      presenceData.buttons = [
        {
          label: 'Show Charts',
          url: href,
        },
      ]
    }

    if (pathname.startsWith("/moods_and_genres")) {
      presenceData.details = 'Browsing Moods & Genres'

      presenceData.buttons = [
        {
          label: 'Show Moods & Genres',
          url: href,
        },
      ]
    }
  }

  if (!presenceData.largeImageKey){
    presenceData.smallImageKey = null
  }

  presence.setActivity(presenceData)
})

function updateSongTimestamps(useTimeLeft: boolean) {
  const [currTimes, totalTimes] = document
    .querySelector<HTMLSpanElement>('#left-controls > span')
    ?.textContent
    ?.trim()
    ?.split(' / ') ?? []

  if (useTimeLeft && currTimes && totalTimes) {
    mediaTimestamps = getTimestamps(
      timestampFromFormat(currTimes),
      timestampFromFormat(totalTimes),
    )
  }
  else if (currTimes) {
    mediaTimestamps = [
      Date.now() / 1000 - timestampFromFormat(currTimes),
      0,
    ]
  }
}
