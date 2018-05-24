const cheerio = require("cheerio");
const fetch = require("node-fetch");
const _ = require("lodash");

const COLOR_MAP = {
  "#196127": 4,
  "#239a3b": 3,
  "#7bc96f": 2,
  "#c6e48b": 1,
  "#ebedf0": 0
};

async function fetchYears(username) {
  const data = await fetch(`https://github.com/${username}`);
  const $ = cheerio.load(await data.text());
  return $(".js-year-link")
    .get()
    .map(a => {
      const $a = $(a);
      return {
        href: $a.attr("href"),
        text: $a.text().trim()
      };
    });
}

async function fetchDataForYear(url, year, format) {
  const data = await fetch(`https://github.com${url}`);
  const $ = cheerio.load(await data.text());
  $days = $("rect.day");
  const contribText = $(".js-contribution-graph h2")
    .text()
    .trim()
    .match(/^([0-9,]+)\s/);
  let contribCount;
  if (contribText) {
    [contribCount] = contribText;
    contribCount = parseInt(contribCount.replace(/,/g, ""), 10);
  }

  return {
    year,
    total: contribCount || 0,
    range: {
      start: $($days.get(0)).attr("data-date"),
      end: $($days.get($days.length - 1)).attr("data-date")
    },
    contributions: (() => {
      const parseDay = day => {
        const $day = $(day);
        const date = $day
          .attr("data-date")
          .split("-")
          .map(d => parseInt(d));
        const color = $day.attr("fill");
        const value = {
          date: $day.attr("data-date"),
          count: parseInt($day.attr("data-count"), 10),
          color,
          intensity: COLOR_MAP[color.toLowerCase()] || 0
        };
        return { date, value };
      };
      const obj = $days.get().reduce((o, day) => {
        const { date, value } = parseDay(day);
        const [y, m, d] = date;
        if (!o[y]) o[y] = {};
        if (!o[y][m]) o[y][m] = {};
        o[y][m][d] = value;
        return o;
      }, {});
      const arr = $days.get().map(day => parseDay(day).value);
      return format === "nested" ? obj : arr;
    })()
  };
}

async function fetchDataForAllYears(username, format) {
  const years = await fetchYears(username);
  return Promise.all(
    years.map(year => fetchDataForYear(year.href, year.text, format))
  ).then(resp => {
    return {
      years: (() => {
        const obj = {};
        const arr = resp.map(year => {
          const { contributions, ...rest } = year;
          _.setWith(obj, [rest.year], rest, Object);
          return rest;
        });
        return format === "nested" ? obj : arr;
      })(),
      contributions:
        format === "nested"
          ? resp.reduce((acc, curr) => _.merge(acc, curr.contributions))
          : resp
              .reduce((list, curr) => [...list, ...curr.contributions], [])
              .sort((a, b) => {
                if (a.date < b.date) return 1;
                else if (a.date > b.date) return -1;
                return 0;
              })
    };
  });
}

module.exports = {
  fetchDataForAllYears
};
