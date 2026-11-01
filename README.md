# Union Street Gaming

The site for [unionstreetgaming.com](https://unionstreetgaming.com): a simple game selector.

It's plain static HTML and CSS with no build step. Open `index.html` in a browser to preview it.

## Add a game

Copy one of the `<li>` cards in `index.html` and change the link, name, description, and tags.

## Theme

Colors follow [Dracula](https://draculatheme.com) in dark mode and its Alucard variant in light mode, set in
`style.css`. The page follows the system setting, and the button in the top right overrides it (remembered per
browser).

## Deploy

Any static host works. On Netlify, create a site from this repo with no build command and `.` as the publish
directory, then add `unionstreetgaming.com` under Domain management.
