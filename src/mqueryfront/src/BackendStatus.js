import React, {Component} from 'react';


class BackendJobRow extends Component {
    render() {
        return <tr>
            <td>{this.props.id}</td>
            <td>{this.props.connection_id}</td>
            <td><code>{this.props.request}</code></td>
            <td>
                {this.props.work_done} / {this.props.work_estimated}
            </td>
        </tr>;
    }
}

class BackendStatus extends Component {
    constructor(props) {
        super(props);
    }

    render() {
        const backendJobRows = this.props.jobs
            .map((job) =>
                <BackendJobRow {...job} key={job.id}/>
            );

        return (
            <div className="table-responsive">
                <table className="table table-striped table-bordered">
                    <thead>
                    <tr>
                        <th>id</th>
                        <th>conn</th>
                        <th>request</th>
                        <th>progress</th>
                    </tr>
                    </thead>
                    <tbody>
                        {backendJobRows}
                    </tbody>
                </table>
            </div>
        );
    }
}

export default BackendStatus;
