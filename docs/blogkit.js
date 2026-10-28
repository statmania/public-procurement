/* Blogkit: dynamic sidebar widgets, post extras, tags page and author pages.
 *
 * All data comes from blogkit-data.js (a script file, so it also works when a page is
 * opened straight from disk), which build_site_data.py rewrites on
 * every `quarto render` (even of a single post). Nothing here is baked into pages,
 * so a new or retagged post shows up everywhere on the next page load.
 * Loaded on every page by site-include.html (copied to the output folder as blogkit.js).
 */
(function () {
  var me = document.currentScript;
  var base = (me && me.dataset.base) || '';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var small = window.matchMedia('(max-width: 991.98px)');
  var CFG = {};
  var LABELS = {
    onThisPage: 'On this page', archive: 'Archive', tags: 'Tags', categories: 'Categories', related: 'Related posts', prevPost: 'Previous post', nextPost: 'Next post',
    allCategories: 'All categories', allTags: 'All tags', category: 'Category', tag: 'Tag',
    pickTag: 'Pick a tag to see its posts.', pickCategory: 'Pick a category to see its posts.', post: 'post', posts: 'posts', allPosts: 'All posts',
    searchPosts: 'Search posts', moreTopics: 'more', topics: 'topics', updated: 'updated', rss: 'RSS',
    prev: '\u2039 Prev', next: 'Next \u203a', allBy: 'All {n} posts by {name}', of: '{a} of {b} posts'
  };
  function t(key, vars) {
    var s = (CFG.labels && CFG.labels[key]) || LABELS[key];
    Object.keys(vars || {}).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }

  // ---------- tiny helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function link(href, text, cls) {
    var a = el('a', cls, text);
    a.href = href;
    return a;
  }
  function tagHref(t) { return base + 'tags.html#tag=' + encodeURIComponent(t); }
  function catHref(c) { return base + 'categories.html#category=' + encodeURIComponent(c); }
  function assetHref(u) { return /^(https?:)?\/\//.test(u) ? u : base + u; }
  function ready(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn);
  }
  function counter(list) {
    var c = {};
    list.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
    return c;
  }
  function byCount(c) {
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); });
  }

  // ---------- "On this page" for small screens (needs no data) ----------
  function mobileToc() {
    var toc = document.querySelector('#quarto-margin-sidebar #TOC');
    var main = document.getElementById('quarto-document-content');
    // Quarto rewrites the TOC hrefs to absolute URLs on load, so read the hash from
    // data-scroll-target (or the href) instead of requiring href="#..."
    function hashOf(a) {
      var h = a.getAttribute('data-scroll-target') || a.getAttribute('href') || '';
      var i = h.indexOf('#');
      return i < 0 ? '' : h.slice(i);
    }
    var srcs = [].filter.call(toc ? toc.querySelectorAll('a') : [], function (a) { return hashOf(a).length > 1; });
    if (!toc || !main || !srcs.length) return;
    var box = el('details', 'bk-toc-mobile');
    var sum = el('summary', null, t('onThisPage'));
    var nav = el('nav');
    nav.setAttribute('aria-label', t('onThisPage'));
    var links = [];
    srcs.forEach(function (src) {
      var a = link(hashOf(src), src.textContent);
      a.addEventListener('click', function () { box.open = false; });
      nav.appendChild(a);
      links.push(a);
    });
    box.appendChild(sum);
    box.appendChild(nav);
    main.insertBefore(box, main.firstChild);
    var heads = links.map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); });
    function spy() {
      var cur = 0;
      heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 120) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
      sum.textContent = 'On this page · ' + (links[cur] ? links[cur].textContent : '');
    }
    window.addEventListener('scroll', spy, {passive: true});
    spy();
  }

  // ---------- data ----------
  function prepare(data) {
    CFG = data.config || {};
    var posts = data.posts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var authors = {}, byName = {};
    Object.keys(data.authors || {}).forEach(function (slug) {
      var a = data.authors[slug];
      a.slug = slug;
      a.posts = [];
      authors[slug] = a;
      [a.name].concat(a.aliases || []).forEach(function (n) { byName[n.toLowerCase()] = a; });
    });
    posts.forEach(function (p) {
      var a = byName[(p.author || '').toLowerCase()];
      if (a) a.posts.push(p);
    });
    return {posts: posts, authors: authors, byName: byName};
  }
  function postHref(p) { return base + p.href; }
  function postItem(p) {   // tag, category and author lists: thumbnail, title, date, description
    var li = el('li', 'bk-rel-item bk-post-item');
    var a = link(postHref(p), '', 'bk-rel-link');
    a.appendChild(thumb(p));
    var body = el('span', 'bk-rel-body');
    body.appendChild(el('span', 'bk-rel-title', p.title));
    body.appendChild(el('span', 'bk-tp-date', p.date));
    if (p.desc) body.appendChild(el('span', 'bk-rel-desc', p.desc));
    a.appendChild(body);
    li.appendChild(a);
    return li;
  }

  // ---------- sidebar: archive + tag cloud ----------
  function archive(posts) {
    var years = {};
    posts.forEach(function (p) {
      var y = +p.date.slice(0, 4), m = +p.date.slice(5, 7);
      ((years[y] = years[y] || {})[m] = years[y][m] || []).push(p);
    });
    var nav = el('nav', 'bk-widget bk-archive');
    nav.setAttribute('aria-label', 'Post archive');
    nav.appendChild(el('h3', 'bk-widget-title', t('archive')));
    Object.keys(years).sort(function (a, b) { return b - a; }).forEach(function (y, i) {
      var n = 0;
      Object.keys(years[y]).forEach(function (m) { n += years[y][m].length; });
      var yd = el('details', 'bk-year');
      yd.open = i === 0;
      var ys = el('summary', null, y + ' ');
      ys.appendChild(el('span', 'bk-count', n));
      yd.appendChild(ys);
      Object.keys(years[y]).sort(function (a, b) { return b - a; }).forEach(function (m) {
        var items = years[y][m];
        var md = el('details', 'bk-month');
        var ms = el('summary', null, MONTHS[m - 1] + ' ');
        ms.appendChild(el('span', 'bk-count', items.length));
        md.appendChild(ms);
        var ul = el('ul');
        items.forEach(function (p) {
          var li = el('li');
          li.appendChild(link(postHref(p), p.title));
          ul.appendChild(li);
        });
        md.appendChild(ul);
        yd.appendChild(md);
      });
      nav.appendChild(yd);
    });
    return nav;
  }
  function chips(counts, active, hrefFn) {
    var keys = byCount(counts);
    var lo = counts[keys[keys.length - 1]], hi = counts[keys[0]];
    var frag = document.createDocumentFragment();
    keys.forEach(function (t) {
      var size = 0.78 + (hi > lo ? 0.5 * (counts[t] - lo) / (hi - lo) : 0);
      var a = link((hrefFn || tagHref)(t), t + ' ', 'bk-tag');
      a.dataset.tag = t;
      a.style.fontSize = size.toFixed(2) + 'rem';
      a.appendChild(el('span', 'bk-count', counts[t]));
      if (t === active) a.classList.add('active');
      frag.appendChild(a);
    });
    return frag;
  }
  function tagCounts(posts) {
    var all = [];
    posts.forEach(function (p) { new Set(p.tags).forEach(function (t) { all.push(t); }); });
    return counter(all);
  }
  var SIDEBAR_TAGS = 15;   // sidebar cloud shows only the most-used tags, then a link to tags.html
  function cloud(posts) {
    var sec = el('section', 'bk-widget bk-tags');
    sec.setAttribute('aria-label', 'Tag cloud');
    sec.appendChild(el('h3', 'bk-widget-title', t('tags')));
    var box = el('div', 'bk-tag-cloud');
    var all = tagCounts(posts), top = {};
    byCount(all).slice(0, SIDEBAR_TAGS).forEach(function (k) { top[k] = all[k]; });
    box.appendChild(chips(top));
    sec.appendChild(box);
    sec.appendChild(link(base + 'tags.html', t('allTags') + ' \u203a', 'bk-tags-all'));
    return sec;
  }
  function sidebarWidgets(D) {
    var side = document.getElementById('quarto-margin-sidebar');
    var main = document.getElementById('quarto-document-content');
    if (!side) return;
    // Keep "On this page" in view while reading (desktop): wrap the TOC in a track that fills the
    // sidebar above the widgets, so a sticky TOC never runs over the archive and tag cloud.
    var toc = side.querySelector('#TOC');
    if (toc && !toc.parentNode.classList.contains('bk-toc-track')) {
      var track = el('div', 'bk-toc-track');
      toc.parentNode.insertBefore(track, toc);
      track.appendChild(toc);
    }
    var w = el('div');
    w.id = 'bk-widgets';
    w.appendChild(cloud(D.posts));
    w.appendChild(archive(D.posts));
    // Posts on small screens: Quarto hides the sidebar, so widgets go under the article.
    function place() {
      var bottom = small.matches && side.querySelector('#TOC') && main;
      var track = side.querySelector('.bk-toc-track');
      w.classList.toggle('bk-widgets-bottom', !!bottom);
      (bottom ? main : (track || side)).appendChild(w);   // desktop: widgets ride with the TOC in one sticky block
      stick();
    }
    // The block sticks at the top while reading. "On this page" must stay fully in view, so only
    // the widgets below it may run past the window bottom (they show at the end of the article).
    function stick() {
      var track = side.querySelector('.bk-toc-track'), toc = track && track.querySelector('#TOC');
      if (!track) return;
      var h = toc ? toc.offsetHeight : 0;
      track.style.top = Math.min(88, window.innerHeight - h - 16) + 'px';
    }
    window.addEventListener('resize', stick);
    window.addEventListener('load', stick);
    if (window.ResizeObserver) { var ro = new ResizeObserver(stick); var tr = side.querySelector('.bk-toc-track'); if (tr) ro.observe(tr); }
    place();
    if (small.addEventListener) small.addEventListener('change', place);
  }

  // ---------- post page extras ----------
  function related(D, me, k) {
    var feats = function (p) { return p.tags.concat(p.cats.map(function (c) { return 'cat:' + c; })); };
    var df = {}, n = D.posts.length;
    D.posts.forEach(function (p) { new Set(feats(p)).forEach(function (f) { df[f] = (df[f] || 0) + 1; }); });
    var mine = new Set(feats(me)), scored = [];
    D.posts.forEach(function (q) {
      if (q === me) return;
      var s = 0;
      new Set(feats(q)).forEach(function (f) {
        if (mine.has(f)) s += Math.log(n / df[f]) * (f.indexOf('cat:') === 0 ? 0.5 : 1);
      });
      if (s > 0) scored.push([s, q]);
    });
    scored.sort(function (a, b) { return b[0] - a[0] || (a[1].date < b[1].date ? 1 : -1); });
    return scored.slice(0, k).map(function (x) { return x[1]; });
  }
  function thumb(p) {
    var img = el('img', 'bk-rel-thumb' + (p.adapt ? ' bk-adapt' : ''));
    img.src = assetHref(p.image || 'img/placeholder.svg');   // the starter site ships img/placeholder.svg
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function () { img.remove(); };
    return img;
  }
  function postNav(D, me) {
    var i = D.posts.indexOf(me);
    var older = D.posts[i + 1], newer = D.posts[i - 1];   // posts are sorted newest first
    if (!older && !newer) return null;
    var nav = el('nav', 'bk-postnav');
    nav.setAttribute('aria-label', 'Previous and next post');
    function side(p, cls, label) {
      if (!p) return nav.appendChild(el('span', 'bk-postnav-empty'));
      var a = link(postHref(p), '', 'bk-postnav-link ' + cls);
      a.appendChild(thumb(p));
      var body = el('span', 'bk-rel-body');
      body.appendChild(el('span', 'bk-postnav-label', label));
      body.appendChild(el('span', 'bk-rel-title', p.title));
      body.appendChild(el('span', 'bk-tp-date', p.date));
      a.appendChild(body);
      nav.appendChild(a);
    }
    side(older, 'bk-postnav-prev', '\u2039 ' + t('prevPost'));
    side(newer, 'bk-postnav-next', t('nextPost') + ' \u203a');
    return nav;
  }
  function relatedItem(p) {
    var li = el('li', 'bk-rel-item');
    var a = link(postHref(p), '', 'bk-rel-link');
    a.appendChild(thumb(p));
    var body = el('span', 'bk-rel-body');
    body.appendChild(el('span', 'bk-rel-title', p.title));
    body.appendChild(el('span', 'bk-tp-date', p.date));
    a.appendChild(body);
    li.appendChild(a);
    return li;
  }
  function authorCard(a) {
    var card = el('aside', 'bk-author-card');
    if (a.image) {
      var img = el('img', 'bk-author-img');
      img.src = base + a.image;
      img.alt = '';
      card.appendChild(img);
    }
    var body = el('div');
    body.appendChild(el('div', 'bk-author-card-name', a.name));
    body.appendChild(el('p', null, a.tagline || a.bio));
    body.appendChild(link(base + 'authors/' + a.slug + '.html',
      'All ' + a.posts.length + ' posts by ' + a.name + ' →', 'bk-author-more'));
    card.appendChild(body);
    return card;
  }
  function authorLink(node, a) {
    var k = link(base + 'authors/' + a.slug + '.html', node.textContent.trim(), 'bk-author-link');
    // homepage cards sit inside one big <a>; navigate ourselves so the author link wins
    k.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); location.href = k.href; });
    node.textContent = '';
    node.appendChild(k);
  }
  function postExtras(D) {
    var main = document.getElementById('quarto-document-content');
    var here = location.pathname.replace(/index\.html$/, '');
    var me = D.posts.filter(function (p) {
      return here.endsWith('/' + p.href.replace(/index\.html$/, ''));
    })[0];
    if (!me || !main) return;

    // byline -> author page
    document.querySelectorAll('.quarto-title-meta-heading').forEach(function (h) {
      if (!/^authors?$/i.test(h.textContent.trim())) return;
      h.nextElementSibling.querySelectorAll('p').forEach(function (p) {
        var a = D.byName[p.textContent.trim().toLowerCase()];
        if (a) authorLink(p, a);
      });
    });
    // tags
    if (me.tags.length) {
      var row = el('div', 'bk-post-tags');
      row.appendChild(el('span', 'bk-post-tags-label', t('tags')));
      me.tags.forEach(function (t) { row.appendChild(link(tagHref(t), t, 'bk-tag')); });
      main.appendChild(row);
    }
    // author card
    var au = D.byName[(me.author || '').toLowerCase()];
    if (au) main.appendChild(authorCard(au));
    // previous / next post
    var pn = postNav(D, me);
    if (pn) main.appendChild(pn);
    // related posts
    var rel = related(D, me, CFG.related || 5);
    if (rel.length) {
      var box = el('section', 'bk-related');
      box.appendChild(el('h2', null, t('related')));
      var ul = el('ul', 'bk-rel-list');
      rel.forEach(function (p) { ul.appendChild(relatedItem(p)); });
      box.appendChild(ul);
      main.appendChild(box);
    }
  }
  // listing cards: mark generated (dark) covers so the light theme can adapt them
  function adaptCards(D) {
    // compare resolved paths: Quarto rewrites listing hrefs to absolute URLs on load
    var path = function (h) { return new URL(h, location.href).pathname; };
    var adapt = {};
    D.posts.forEach(function (p) { if (p.adapt) adapt[path(base + p.href)] = true; });
    // grid cards: <a class="quarto-grid-link"> around the card; default cards: .quarto-post with a title link
    document.querySelectorAll('.quarto-listing img.thumbnail-image, .quarto-post .thumbnail img').forEach(function (img) {
      var card = img.closest('.quarto-post');
      var a = img.closest('a[href]') || (card && card.querySelector('a[href]'));
      if (a && adapt[path(a.getAttribute('href'))]) img.classList.add('bk-adapt');
    });
  }
  function homepageBylines(D) {
    document.querySelectorAll('.listing-author').forEach(function (n) {
      var a = D.byName[n.textContent.trim().toLowerCase()];
      if (a) authorLink(n, a);
    });
  }

  // ---------- homepage hero tools: search box, topic chips, stats strip ----------
  // Fills <div id="bk-hero-tools"></div> (put it inside your hero). The search box drives
  // Quarto's own listing filter, so it needs `filter-ui: true` in the listing.
  var ICONS = {
    posts: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    topics: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    updated: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    rss: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'bk-icon'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }
  function heroTools(D) {
    var root = document.getElementById('bk-hero-tools');
    if (!root) return;
    document.body.classList.add('bk-has-hero-tools');
    var form, input;
    function filter() {
      var f = document.querySelector('.quarto-listing-filter input.search');
      if (!f) return;
      f.value = input.value;
      ['input', 'keyup'].forEach(function (ev) { f.dispatchEvent(new Event(ev, {bubbles: true})); });
    }
    function wire() {
      input.addEventListener('input', filter);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        filter();
        var l = document.querySelector('.quarto-listing');
        if (l) l.scrollIntoView({behavior: 'smooth', block: 'start'});
      });
    }
    if (root.children.length) {   // markup was included at render time (_bk-hero-tools.html): just attach the search
      form = root.querySelector('.bk-hero-search'); input = root.querySelector('input');
      if (form && input) wire();
      return;
    }
    root.classList.add('bk-hero-built');
    form = el('form', 'bk-hero-search');
    form.setAttribute('role', 'search');
    input = el('input');
    input.type = 'search';
    input.placeholder = t('searchPosts');
    input.setAttribute('aria-label', t('searchPosts'));
    form.appendChild(input);
    wire();
    var counts = tagCounts(D.posts);
    var chips = el('div', 'bk-hero-chips');
    byCount(counts).slice(0, CFG.heroTopics || 5).forEach(function (k) {
      chips.appendChild(link(tagHref(k), k, 'bk-tag'));
    });
    chips.appendChild(link(base + 'tags.html', t('moreTopics') + ' \u203a', 'bk-tag bk-tag-more'));
    var latest = D.posts.length ? D.posts[0].date : '';
    var stats = el('p', 'bk-hero-stats');
    var tagline = root.dataset.tagline;   // optional one-line description, shown above the stats
    if (tagline) stats.appendChild(el('span', 'bk-hero-tagline', tagline));
    function stat(name, text, href) {
      var s = href ? link(href, '', 'bk-stat bk-hero-rss') : el('span', 'bk-stat');
      s.append(icon(name), document.createTextNode(text));
      stats.appendChild(s);
    }
    stat('posts', D.posts.length + ' ' + t('posts'));
    stat('topics', Object.keys(counts).length + ' ' + t('topics'));
    if (latest) stat('updated', t('updated') + ' ' + MONTHS[+latest.slice(5, 7) - 1].slice(0, 3) + ' ' + latest.slice(0, 4));
    stat('rss', t('rss'), base + 'index.xml');
    root.append(form, chips, stats);
  }

  // ---------- pager (shared by tags page and author pages) ----------
  // Pager clicks jump to the top. Some pages re-render later (on hashchange), which shrinks the page
  // and would cancel a smooth scroll, so the jump is instant and repeated after the next render.
  var pendingTop = false;
  function toTop() {
    window.scrollTo({top: 0, behavior: 'instant'});
    requestAnimationFrame(function () { window.scrollTo({top: 0, behavior: 'instant'}); setTimeout(function () { window.scrollTo({top: 0, behavior: 'instant'}); }, 120); });
  }
  function pager(nav, pages, page, onPage) {
    nav.textContent = '';
    nav.hidden = pages < 2;
    function btn(label, n, cur, off) {
      var b = el('button', 'bk-page' + (cur ? ' active' : ''), label);
      b.type = 'button';
      b.disabled = !!off;
      if (cur) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', function () { pendingTop = true; onPage(n); toTop(); });
      nav.appendChild(b);
    }
    btn('‹ Prev', page - 1, false, page === 1);
    for (var i = 1; i <= pages; i++) btn(String(i), i, i === page, false);
    btn('Next ›', page + 1, false, page === pages);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.pagination a.page-link')) window.scrollTo({top: 0, behavior: 'smooth'});
  });
  function hashParams() { return new URLSearchParams(location.hash.slice(1)); }

  // ---------- tags page and categories page (same widget, different facet) ----------
  function catCounts(posts) {
    var all = [];
    posts.forEach(function (p) { new Set(p.cats).forEach(function (c) { all.push(c); }); });
    return counter(all);
  }
  function facetPage(D, o) {
    var root = document.getElementById(o.root);
    if (!root) return;
    var side = document.getElementById(o.side);
    var counts = o.counts(D.posts), per = CFG.perPage || 10;
    var hint = el('p', 'bk-tags-hint', t(o.hint));
    var sec = el('section', 'bk-tag-section');
    var nav = el('nav', 'bk-pager');
    nav.setAttribute('aria-label', 'Pagination');
    root.append(hint, sec, nav);
    function render() {
      var h = hashParams(), val = h.get(o.param) || '';
      var list = val ? D.posts.filter(function (p) { return p[o.field].indexOf(val) > -1; }) : D.posts;   // nothing picked: all posts
      if (side) {
        side.textContent = '';
        side.appendChild(el('h3', 'bk-widget-title', t(o.title)));
        var box = el('div', 'bk-tag-cloud');
        box.appendChild(chips(counts, val, o.href));
        side.appendChild(box);
      }
      hint.hidden = !!val;
      sec.hidden = !list.length;
      sec.textContent = '';
      nav.hidden = true;
      if (!list.length) return;
      var pages = Math.ceil(list.length / per);
      var page = Math.min(Math.max(+h.get('page') || 1, 1), pages);
      var title = el('h2', null, (val || t('allPosts')) + ' ');
      title.appendChild(el('span', 'bk-count', list.length + ' ' + (list.length === 1 ? t('post') : t('posts'))));
      var ul = el('ul', 'bk-post-list');
      list.slice((page - 1) * per, page * per).forEach(function (p) { ul.appendChild(postItem(p)); });
      sec.append(title, ul);
      pager(nav, pages, page, function (n) {
        location.hash = (val ? o.param + '=' + encodeURIComponent(val) : '') + (n > 1 ? (val ? '&' : '') + 'page=' + n : '');
      });
    }
    window.addEventListener('hashchange', function () { render(); if (pendingTop) { pendingTop = false; toTop(); } });
    render();
  }
  function tagsPage(D) {
    facetPage(D, {root: 'bk-tags-page', side: 'bk-tags-side', param: 'tag', field: 'tags',
                  title: 'tags', hint: 'pickTag', counts: tagCounts, href: tagHref});
  }
  function categoriesPage(D) {
    facetPage(D, {root: 'bk-cats-page', side: 'bk-cats-side', param: 'category', field: 'cats',
                  title: 'categories', hint: 'pickCategory', counts: catCounts, href: catHref});
  }

  function authorPage(D) {
    var root = document.getElementById('bk-author-root');
    if (!root) return;
    var a = D.authors[root.dataset.slug];
    if (!a) return;
    var posts = a.posts, per = CFG.perPage || 10;
    function opts(label, counts) {
      var s = el('select');
      s.appendChild(new Option(label, ''));
      byCount(counts).forEach(function (k) { s.appendChild(new Option(k + ' (' + counts[k] + ')', k)); });
      return s;
    }
    var allCats = [], allTags = [];
    posts.forEach(function (p) {
      new Set(p.cats).forEach(function (c) { allCats.push(c); });
      new Set(p.tags).forEach(function (t) { allTags.push(t); });
    });
    var selCat = opts(t('allCategories'), counter(allCats)), selTag = opts(t('allTags'), counter(allTags));
    var bar = el('div', 'bk-filter-bar');
    var l1 = el('label', null, t('category') + ' '), l2 = el('label', null, t('tag') + ' ');
    l1.appendChild(selCat); l2.appendChild(selTag);
    var count = el('span', 'bk-filter-count');
    count.setAttribute('aria-live', 'polite');
    bar.append(l1, l2, count);
    var ul = el('ul', 'bk-post-list');
    var nav = el('nav', 'bk-pager');
    nav.setAttribute('aria-label', 'Pagination');
    root.append(bar, ul, nav);

    var st = {cat: '', tag: '', page: 1};
    function read() {
      var h = hashParams();
      selCat.value = h.get('cat') || ''; selTag.value = h.get('tag') || '';
      st.cat = selCat.value; st.tag = selTag.value; st.page = +h.get('page') || 1;
    }
    function write() {
      var h = new URLSearchParams();
      if (st.cat) h.set('cat', st.cat);
      if (st.tag) h.set('tag', st.tag);
      if (st.page > 1) h.set('page', st.page);
      history.replaceState(null, '', location.pathname + (h.toString() ? '#' + h : ''));
    }
    function render() {
      var hit = posts.filter(function (p) {
        return (!st.cat || p.cats.indexOf(st.cat) > -1) && (!st.tag || p.tags.indexOf(st.tag) > -1);
      });
      var pages = Math.max(1, Math.ceil(hit.length / per));
      st.page = Math.min(Math.max(st.page, 1), pages);
      ul.textContent = '';
      hit.slice((st.page - 1) * per, st.page * per).forEach(function (p) { ul.appendChild(postItem(p)); });
      count.textContent = t('of', {a: hit.length, b: posts.length});
      pager(nav, pages, st.page, function (n) {
        st.page = n; write(); render();
      });
    }
    function change() { st.cat = selCat.value; st.tag = selTag.value; st.page = 1; write(); render(); }
    selCat.addEventListener('change', change);
    selTag.addEventListener('change', change);
    window.addEventListener('hashchange', function () { read(); render(); if (pendingTop) { pendingTop = false; toTop(); } });
    read(); render();
  }

  // ---------- go ----------
  mobileToc();
  function start(raw) {
    var D = prepare(raw);
    tagsPage(D);
    categoriesPage(D);
    authorPage(D);
    homepageBylines(D);
    adaptCards(D);
    heroTools(D);
    ready(function () {
      // after load, so Quarto has already copied the TOC into its own structures
      postExtras(D);
      sidebarWidgets(D);
    });
  }
  if (window.BLOGKIT_DATA) start(window.BLOGKIT_DATA);
  else {
    var ds = document.createElement('script');
    ds.src = base + 'blogkit-data.js';
    ds.onload = function () { start(window.BLOGKIT_DATA); };
    ds.onerror = function () { console.warn('site.js: could not load blogkit-data.js'); };
    document.head.appendChild(ds);
  }
})();
