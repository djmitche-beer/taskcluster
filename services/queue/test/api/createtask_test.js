suite('Create task', function() {
  var debug       = require('debug')('test:api:create');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var expect      = require('expect.js');
  var helper      = require('./helper')();

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    // let's just test a large routing key too, 90 chars please :)
    routes:           ["--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---"],
    retries:          5,
    created:          taskcluster.utils.fromNow(),
    deadline:         taskcluster.utils.fromNow('3 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    },
    tags: {
      purpose:        'taskcluster-testing'
    },
    extra: {
      myUsefulDetails: {
        property:     "that is useful by external service!!"
      }
    }
  };

  test("createTask", async () => {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
      'queue:route:*'
    );
    debug("### Start listening for messages");
    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskId
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskId
    }));

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);

    debug("### Wait for defined message");
    var m1 = await helper.events.waitFor('is-defined');
    expect(r1.status).to.be.eql(m1.payload.status);

    debug("### Wait for pending message");
    var m2 = await helper.events.waitFor('is-pending');
    expect(r1.status).to.be.eql(m1.payload.status);

    debug("### Get task status");
    var r2 = await helper.queue.status(taskId);
    expect(r1.status).to.be.eql(r2.status);
  });

  test("createTask (without required scopes)", async () => {
    var taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:my-provisioner/another-worker',
      'queue:route:wrong-route'
    );
    await helper.queue.createTask(taskId, taskDef).then(() => {
      expect().fail("Expected an authentication error");
    }, (err) => {
      debug("Got expected authentication error: %s", err);
    });
  });

  test("createTask is idempotent", async () => {
    var taskId = slugid.v4();

    var r1 = await helper.queue.createTask(taskId, taskDef);
    var r2 = await helper.queue.createTask(taskId, taskDef);
    expect(r1).to.be.eql(r2);

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, _.defaults({
      workerType:   "another-worker"
    }, taskDef)).then(() => {
      expect.fail("This operation should have failed!");
    }, (err) => {
      expect(err.statusCode).to.be(409);
      debug("Expected error: %j", err, err);
    });
  });


  test("defineTask", async () => {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:route:---*'
    );
    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskId
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskId
    }));

    await helper.queue.defineTask(taskId, taskDef);
    await helper.events.waitFor('is-defined');

    // Fail execution, if the task-pending event arrives
    await new Promise((accept, reject) => {
      helper.events.waitFor('is-pending').then(reject, reject);
      setTimeout(accept, 500);
    }).catch(() => {
      expect.fail("Didn't expect task-pending message to arrive!");
    });
  });

  test("defineTask and scheduleTask", async () => {
    var taskId = slugid.v4();
    var taskIsScheduled = false;

    await helper.events.listenFor('pending', helper.queueEvents.taskPending({
      taskId: taskId
    }))

    var gotMessage = helper.events.waitFor('pending').then((message) => {
      assert(taskIsScheduled, "Got pending message before scheduleTask");
      return message;
    });


    await helper.queue.defineTask(taskId, taskDef);
    await base.testing.sleep(500);

    taskIsScheduled = true;
    helper.scopes(
      'queue:schedule-task',
      'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ'
    );
    var r1 = await helper.queue.scheduleTask(taskId);
    var m1 = await gotMessage;
    expect(r1.status).to.be.eql(m1.payload.status);
  });

  test("defineTask is idempotent", async () => {
    var taskId = slugid.v4();
    await helper.queue.defineTask(taskId, taskDef);
    await helper.queue.defineTask(taskId, taskDef);

    // Verify that we can't modify the task
    await helper.queue.defineTask(taskId, _.defaults({
      workerType:   "another-worker"
    }, taskDef)).then(() => {
      expect().fail("This operation should have failed!");
    }, (err) => {
      expect(err.statusCode).to.be(409);
      debug("Expected error: %j", err, err);
    });
  });
});