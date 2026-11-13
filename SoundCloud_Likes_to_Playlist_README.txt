SoundCloud Public Likes to Playlist
Windows userscript for Tampermonkey

WHAT IT DOES

This userscript scans another SoundCloud user’s public /likes page and uses the visible SoundCloud page controls to add those tracks to one or more of your existing playlists. It does not use a SoundCloud API key or ask for your password. You must already be signed in to your own SoundCloud account in the same browser.

FILES

SoundCloud_Likes_to_Playlist.user.js
This is the Tampermonkey script.

AUTOMATIC UPDATES

The script is hosted in the public GitHub repository dukiebrown/Mornye on the soundcloud-likes-to-playlist-updates branch. Install the script from its GitHub raw URL once to connect Tampermonkey to the update source:
https://raw.githubusercontent.com/dukiebrown/Mornye/soundcloud-likes-to-playlist-updates/SoundCloud_Likes_to_Playlist.user.js

After that, Tampermonkey can check for newer versions and download them from the same source. Scripts installed from earlier local files do not have this update source configured; replace the earlier script with the hosted version once.

INSTALL

1. Install Tampermonkey from https://www.tampermonkey.net/ in Chrome, Edge, or Firefox.
2. Open Tampermonkey’s dashboard and use its import option to select SoundCloud_Likes_to_Playlist.user.js. You can also open the downloaded .user.js file if your browser offers Tampermonkey as the handler.
3. Approve the userscript in Tampermonkey.
4. Sign in to your own SoundCloud account in the same browser.

USE

1. Open the other user’s public SoundCloud Likes page. It should have a URL like https://soundcloud.com/username/likes. Private likes cannot be copied.
2. Prepare one or more existing playlists that you own. SoundCloud currently limits each playlist to 500 tracks. For 1,250 likes, use at least three playlists. Empty playlists are easiest.
3. The script panel now has three separate playlist fields already filled with “Dema Likes,” “Dema Likes 2,” and “Dema Likes 3.” Edit a field if a title is different. Click Add another playlist to add more fields; you do not need to press Enter to separate names. The script fills playlists in order.
4. Set “New tracks to add to each playlist” to a number of free slots each listed playlist has, up to 500. Empty playlists are simplest; if they have different amounts of free space, use the smallest amount.
5. Click Scan public likes. The page scrolls faster through already-loaded tracks and waits briefly near the end of the list for more to load, then returns to its starting position. The script collects up to 10,000 track links that are inside recognizable track rows and remembers their page positions. After updating the script, reload the Likes page and scan again so any stale scan list is replaced; remembered completion progress is preserved.
6. Click 5-track test. Keep the tab open while it runs. It starts with the first playlist. The default wait between tracks is 1 second, plus up to 0.3 seconds of random delay. You can increase the wait if SoundCloud starts showing errors.
7. Check the first destination playlist manually. If the test worked, click Copy remaining tracks. The script returns to each track’s position if SoundCloud has removed its off-screen row, then uses the playlist picker. If the matching playlist shows “Added,” the script marks the track complete, closes the picker, and skips it without using a new-track slot. Items without an Add to playlist control, such as liked playlists that cannot be added as tracks, are marked skipped and the script continues. Otherwise, it clicks “Add to Playlist,” closes the picker, and continues. It handles items one at a time through the visible interface, filling each destination up to the configured amount (at most 500 new additions) before moving to the next. Tracks completed or skipped in the same tab are remembered.
8. If all listed playlists reach their configured capacity, click Add another playlist, enter its exact title, and click Copy remaining tracks again.

Example for 1,250 tracks: list three empty playlists and leave the amount at 500. The script can add up to 500 to the first, 500 to the second, and 250 to the third.

At the 1-second default, the configured waits alone take about 21–27 minutes for 1,250 tracks. SoundCloud still needs time to process each menu and playlist addition, so the full run takes longer.

SAFETY AND LIMITS

- The script skips tracks whose matching destination row already says “Added” and skips items with no available add-to-playlist control. It stops on an unclear playlist selection or a SoundCloud error after an add action. Check the destination playlist before trying again if it stops on a track.
- SoundCloud’s 500-track cap is per playlist. This script can scan up to 10,000 tracks and split the transfer across multiple playlists, but you need enough destination playlists and free slots.
- The script does not inspect how many tracks are already in a destination playlist. If a playlist is not empty, set the per-playlist amount to its available free slots.
- Do not use this to copy private, restricted, or inaccessible content. Only public Likes pages are scanned.
- SoundCloud can change its page layout. If a menu or button label changes, the script may stop without adding that track.
- Leave the page open during a copy. You can request a stop; the current track action finishes before the script stops.
- “Clear remembered progress” allows you to start the same Likes page again. Use it carefully: tracks already added may be duplicated.

VERIFICATION STATUS

This is a regenerated prototype (version 1.9.0). It has not been live-tested with a logged-in SoundCloud session. Do not treat it as a verified SoundCloud transfer until the 5-track test succeeds in your browser.

IF THE SCAN BUTTON IS GRAY

The updated 1.9.0 script detects when SoundCloud changes pages without reloading, uses separate prefilled fields for playlist titles, handles the Add to playlist picker, skips tracks already marked “Added,” and marks items with no add control as skipped so a liked playlist does not stop the run. It only scans SoundCloud links inside rows with track controls so footer links such as “Artist Resources” are ignored. It scans with a shorter adaptive wait, returns to off-screen track positions while copying, and recognizes SoundCloud row controls rendered as labeled links or buttons. If you already installed an earlier version, replace it once with the GitHub-hosted script above, then reload SoundCloud. Make sure the address ends in /username/likes. When the Likes page is detected, the Scan public likes button should become available. If you are on a different SoundCloud page, the buttons remain disabled.

SOURCES

SoundCloud help: Adding, Removing and Rearranging Tracks in a Playlist or Album
https://help.soundcloud.com/hc/en-us/articles/115003449787-Adding-Removing-and-Rearranging-Tracks-in-a-Playlist-or-Album

SoundCloud help: Playlist Limits
https://help.soundcloud.com/hc/en-us/articles/360005673974-Playlist-Limits
