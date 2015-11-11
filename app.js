var DateUtil = {
  setToZeroOClock: function (date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
  },
  computeDateDifference: function (date1, date2) {
    DateUtil.setToZeroOClock(date1);
    DateUtil.setToZeroOClock(date2);
    return Math.ceil((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
  },
  computeDateDifferenceWithNow: function (date) {
    return DateUtil.computeDateDifference(new Date(), date);
  },
  isInThePast: function (date) {
    return (DateUtil.computeDateDifferenceWithNow(date) < 0);
  },
  isToday: function (date) {
    return (DateUtil.computeDateDifferenceWithNow(date) == 0);
  },
  isTomorrow: function (date) {
    return (DateUtil.computeDateDifferenceWithNow(date) == 1);
  },
  isInThisWeek: function (date) {
    DateUtil.setToZeroOClock(date);
    var now = new Date();
    var dateDifference = DateUtil.computeDateDifferenceWithNow(date);
    return (dateDifference >= 0 && dateDifference <= 6 && (date.getDay() >= now.getDay() || date.getDay() == 0));
  },
  isInNextWeek: function (date) {
    var now = new Date();
    var dateDifferenceWithThisSunday = DateUtil.computeDateDifferenceWithNow(date) - (7 - now.getDay());
    return (dateDifferenceWithThisSunday >= 1 && dateDifferenceWithThisSunday <= 7);
  },
  getDateDescriptor: function (date) {
    var numbers = ['日', '一', '二', '三', '四', '五', '六'];
    
    if (DateUtil.isToday(date)) {
      return "今天";
    } else if (DateUtil.isTomorrow(date)) {
      return "明天";
    } else if (DateUtil.isInThisWeek(date)) {
      return '周' + numbers[date.getDay()];
    } else if (DateUtil.isInNextWeek(date)) {
      return '下周' + numbers[date.getDay()];
    } else {
      return (date.getMonth() + 1) + '-' + date.getDate();
    }
  }
};

var HomeworkUtil = {
  parseIssues: function (issueList) {
    var homeworkList = [];
    issueList.forEach(function (issue) {
      var metadata = issue.body.substring(0, issue.body.indexOf('---'));
      var homework = jsyaml.safeLoad(metadata);
      
      homework.id = issue.number;
      homework.course = issue.title;
      homework.content = issue.body.substring(issue.body.indexOf('---') + 7);
      
      homework.labels = [];
      issue.labels.forEach(function (label) {
        homework.labels.push(label.name);
        if (label.name == 'lab') {
          homework.type = 'lab';
        }
      });
      homework.type = homework.type || 'homework';
      
      homework.url = issue.url;
      
      if (homework.deadline != 'end-of-term' || homework.deadline != 'unknown') {
        homework.deadlineTime = new Date(homework.deadline);
        DateUtil.setToZeroOClock(homework.deadlineTime);
      }
      
      if (homework.deadline == 'end-of-term') {
        homework.deadlineDescriptor = '期末';
      } else if (homework.deadline == 'unknown') {
        homework.deadlineDescriptor = '未知';
      } else {
        homework.deadlineDescriptor = DateUtil.getDateDescriptor(homework.deadlineTime);
      }
      
      homeworkList.push(homework);
    });
    return homeworkList;
  },
  
  getHomeworkList: function (options) {
    options = (typeof options !== 'object') ? {} : options;
    options.success = options.success || function (homeworkList) {};
    options.error = options.error || function (jqXHR, textStatus, errorThrown) {};
    
    var data = {};
    if (_config.access_token != '') {
      data.access_token = _config.access_token;
    }
    
    $.ajax({
      url: "https://api.github.com/repos/beta/homework/issues",
      data: data,
      success: function (data, textStatus, jqXHR) {
        var homeworkList = HomeworkUtil.parseIssues(data);
        options.success(homeworkList);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        options.error(jqXHR, textStatus, errorThrown);
      }
    });
  },
  
  sortHomeworkList: function (homeworkList) {
    var sortedHomeworkList = {
      today: [],
      tomorrow: [],
      thisWeek: [],
      nextWeek: [],
      later: []
    };
    
    homeworkList.forEach(function (homework) {
      if (homework.deadline == 'end-of-term' || homework.deadline == 'unknown') {
        sortedHomeworkList.later.push(homework);
      } else {
        if (DateUtil.isToday(homework.deadlineTime)) {
          sortedHomeworkList.today.push(homework);
        } else if (DateUtil.isTomorrow(homework.deadlineTime)) {
          sortedHomeworkList.tomorrow.push(homework);
        } else if (DateUtil.isInThisWeek(homework.deadlineTime)) {
          sortedHomeworkList.thisWeek.push(homework);
        } else if (DateUtil.isInThePast(homework.deadlineTime)) {
          // Drop this homework.
        } else {
          sortedHomeworkList.later.push(homework);
        }
      }
    });
    
    var compareByDeadline = function (homework1, homework2) {
      if (homework1.deadline == 'end-of-term' || homework1.deadline == 'unknown') {
        return Infinity;
      } else if (homework2.deadline == 'end-of-term' || homework2.deadline == 'unknown') {
        return (-1) * Infinity;
      } else {
        return (homework1.deadlineTime - homework2.deadlineTime);
      }
    };
    
    sortedHomeworkList.today.sort(compareByDeadline);
    sortedHomeworkList.tomorrow.sort(compareByDeadline);
    sortedHomeworkList.thisWeek.sort(compareByDeadline);
    sortedHomeworkList.later.sort(compareByDeadline);
    
    return sortedHomeworkList;
  },
  
  getSortedHomeworkList: function (options) {
    return HomeworkUtil.sortHomeworkList(HomeworkUtil.getHomeworkList(options));
  }
}

var showSpinner = function () {
  var spinner = document.createElement('div');
  spinner.className = 'homework-spinner mdl-progress mdl-js-progress mdl-progress__indeterminate';
  componentHandler.upgradeElement(spinner);
  
  $('#main').empty();
  $('#main').append(spinner);
};

var loadAndShowHomeworkList = function () {
  HomeworkUtil.getHomeworkList({
    success: function (homeworkList) {
      homeworkList = HomeworkUtil.sortHomeworkList(homeworkList);
      window.homeworks.list = homeworkList;
      
      var ractiveIndex = new Ractive({
        el: 'main',
        template: '#list-template',
        data: {
          homeworkList: homeworkList
        }
      });
      
      window.homeworks.pages.index = ractiveIndex.toHTML();
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error(errorThrown);
    }
  });
}

var index = function () {
  $('title').html(_config.title);
  
  showSpinner();
  
  window.homeworks = window.homeworks || { list: [], pages: {}};
  if (window.homeworks.pages.index != undefined) {
    $('#main').html(window.homeworks.pages.index);
  } else {
    loadAndShowHomeworkList();
  }
};

var detail = function (id) {
  console.log(id);
};

var routes = {
  '/': index,
  '//': index,
  '/homework/:id': detail
};

var router = new Router(routes);
router.init('/');