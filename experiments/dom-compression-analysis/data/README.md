## How do we get the data

0. We take the top-116-domains-annotation-clustering.csv dataset is from the https://github.com/cewebbr/web-unpacked study
1. We exclude login and payment-requiring websites, Adult industry (becuase we might be doing manual evaluations of screenshots of doms later)
2. We manually change search engines + youtubes home pages to a search page. And chnaged wikipendia's home page to the english language home page
3. For each website in the list we collect all the links from the page and sample 3 randomly, making the full dataset = 25 * (1 homepage + 3 sampled pages). We semi-automatically accept all cookies and manually pass captchas (Google)
4. We manually exclude services that are no longer working (https://turbopages.org) or region-restricted (https://www.yahoo.co.jp, https://docomo.ne.jp) or did not load because of bot detection (https://reddit.com)