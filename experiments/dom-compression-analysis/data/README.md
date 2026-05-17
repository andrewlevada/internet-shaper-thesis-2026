## How do we get the data

0. We take the top-116-domains-annotation-clustering.csv dataset is from the https://github.com/cewebbr/web-unpacked study
1. We exclude login and payment-requiring websites, Adult industry (becuase we might be doing manual evaluations of screenshots of doms later)
2. We manually change search engines', youtube's and pinterest's homepages to a search page. And chnaged wikipendia's home page to the english language home page
3. For each website in the list we collect all the same-domain links from the page. We semi-automatically accept all cookies and manually pass captchas (Google). The result is combination of 2 collection runs
4. We manually exclude domains:
    a. Services that are no longer working (https://turbopages.org)
    b. Region-restricted apps (https://www.yahoo.co.jp, https://docomo.ne.jp)
    c. Pages that denied to load due to bot detection (https://reddit.com).
We also exclude pages:
    a. Legal-related pages (ToS, Pricacy Policy, etc)
    b. Regional variations of the same pages 
    c. Sitemaps