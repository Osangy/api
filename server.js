console.log({starting:true});

import express from "express";
import graphqlHTTP from "express-graphql";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql";
import bodyParser from 'body-parser';
import cors from 'cors';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { printSchema } from 'graphql/utilities/schemaPrinter';
import schema from './data/schema';

// const app = express().use('*', cors());
const app = express();
app.set('port', (process.env.PORT || 3001));

app.get('/', (req,res) => {
  res.send("Cooucou");
});

app.use('/graphql', bodyParser.json(), graphqlExpress({ schema: schema }));

app.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql',
}));

app.use('/schema', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(printSchema(schema));
});

app.listen(app.get('port'),() => console.log(
  `Server running on port ${app.get('port')}`
));

// const app = express();
//
//
//

//
// app.use('/graphql', graphqlHTTP({
//   schema: Schema,
//   graphiql: true
// }));
//
// app.listen(3000, () => {
//   console.log({running: true});
// })
