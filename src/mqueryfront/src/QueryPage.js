import React, { Component } from "react";
import QueryField from "./QueryField";
import QueryResultsStatus from "./QueryResultsStatus";
import QueryParseStatus from "./QueryParseStatus";
import axios from "axios";
import { API_URL } from "./config";

class QueryPage extends Component {
    constructor(props) {
        super(props);

        let qhash = null;

        if (this.props.match.params.hash) {
            qhash = this.props.match.params.hash;
        }

        this.state = {
            mode: "query",
            collapsed: false,
            qhash: qhash,
            rawYara: "",
            queryPlan: null,
            queryError: null,
            datasets: {},
        };

        this.updateQhash = this.updateQhash.bind(this);
        this.updateQueryError = this.updateQueryError.bind(this);
        this.updateQueryPlan = this.updateQueryPlan.bind(this);
        this.collapsePane = this.collapsePane.bind(this);
    }

    componentDidMount() {
        if (this.state.qhash) {
            axios.get(API_URL + "/job/" + this.state.qhash).then((response) => {
                this.updateQhash(this.state.qhash, response.data.raw_yara);
            });
        }
        axios.get(API_URL + "/backend/datasets").then((response) => {
            this.setState({ datasets: response.data.datasets });
        });
    }

    componentWillUnmount() {
        if (this.timeout !== null) {
            clearTimeout(this.timeout);
        }

        this.setState({
            qhash: null,
        });
    }

    availableTaints() {
        var taintList = Object.values(this.state.datasets)
            .map((ds) => ds.taints)
            .flat();
        return [...new Set(taintList)];
    }

    updateQhash(newQhash, rawYara) {
        if (typeof rawYara !== "undefined") {
            this.setState({ rawYara: rawYara });
        }

        if (!newQhash) {
            this.props.history.push("/");
        } else {
            this.props.history.push("/query/" + newQhash);
            this.collapsePane();
        }

        this.setState({
            mode: "job",
            queryError: null,
            queryPlan: null,
            qhash: newQhash,
            matches: [],
            job: [],
        });
        this.loadMatches();
    }

    loadMatches() {
        const LIMIT = 50;

        if (!this.state.qhash) {
            return;
        }

        axios
            .get(
                API_URL +
                    "/matches/" +
                    this.state.qhash +
                    "?offset=" +
                    this.state.matches.length +
                    "&limit=" +
                    LIMIT
            )
            .then((response) => {
                let newShouldRequest = true;

                if (
                    ["done", "cancelled", "failed", "expired"].indexOf(
                        response.data.job.status
                    ) !== -1
                ) {
                    if (!response.data.matches.length) {
                        newShouldRequest = false;
                    }
                }

                this.setState({
                    matches: [...this.state.matches, ...response.data.matches],
                    job: response.data.job,
                });

                if (newShouldRequest) {
                    let nextTimeout =
                        response.data.matches.length >= LIMIT ? 50 : 1000;
                    this.timeout = setTimeout(
                        () => this.loadMatches(),
                        nextTimeout
                    );
                }
            })
            .catch(() => {
                this.setState({
                    shouldRequest: false,
                });
            });
    }

    updateQueryError(newError, rawYara) {
        this.setState({
            mode: "query",
            queryError: newError,
            queryPlan: null,
            rawYara: rawYara,
            job: null,
            matches: [],
        });
    }

    updateQueryPlan(parsedQuery, rawYara) {
        this.setState({
            mode: "query",
            queryPlan: parsedQuery,
            queryError: null,
            rawYara: rawYara,
            job: null,
            matches: [],
        });
    }

    collapsePane() {
        this.setState((prevState) => ({
            collapsed: !prevState.collapsed,
        }));
    }

    render() {
        var queryParse = (
            <QueryParseStatus
                qhash={this.state.qhash}
                queryPlan={this.state.queryPlan}
                queryError={this.state.queryError}
            />
        );
        var queryResults = (
            <div>
                <button
                    type="button"
                    className="btn btn-primary btn-sm pull-left mr-4"
                    onClick={this.collapsePane}
                >
                    <span className="fa fa-align-left" />{" "}
                    {this.state.collapsed ? "Show" : "Hide"} query
                </button>
                <QueryResultsStatus
                    qhash={this.state.qhash}
                    job={this.state.job}
                    matches={this.state.matches}
                />
            </div>
        );
        return (
            <div className="container-fluid">
                <div className="row wrapper">
                    <div
                        className={
                            this.state.collapsed ? "is-collapsed" : "col-md-5"
                        }
                    >
                        <QueryField
                            rawYara={this.state.rawYara}
                            isLoading={this.state.qhash && !this.state.rawYara}
                            isLocked={!!this.state.qhash}
                            updateQhash={this.updateQhash}
                            availableTaints={this.availableTaints()}
                            updateQueryPlan={this.updateQueryPlan}
                            updateQueryError={this.updateQueryError}
                        />
                    </div>
                    <div
                        className={
                            this.state.collapsed ? "col-md-12" : "col-md-7"
                        }
                    >
                        {this.state.mode === "query"
                            ? queryParse
                            : queryResults}
                    </div>
                </div>
            </div>
        );
    }
}

export default QueryPage;
