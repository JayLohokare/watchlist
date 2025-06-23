### The project
- Build a stock watchlist service and client application that allows users to view their favorite stock prices.
- Users should be able to search for stocks by name or ticker and add them to a watchlist.
- Users should be able to remove a stock from their watchlist.
- Users should be able to see the current price of the stocks in their watchlist.
- Prices should update every 5 seconds.
- The service should be designed to support millions of users each with their own watchlist.
- User data should be persisted in a database and re-used when the app is restarted.
- The focus for this case study is on the service architecture and communication between the service and client application.
- The client application must support user login and a single screen that contains a search bar, list of stocks and current prices, but it does not need to be a polished UI.

### Setup

### Getting started
You'll need to run a few `Makefile` commands to get started. Run these commands in single terminal.
- `make build` - this will build the Docker images required to run the Django and Celery services
- `make migrate` - this will create the database tables required by Django
- `make createsuperuser` - this will create a superuser for the Django admin page with username=root and password=root
- `make createusers` - this will create user1 and user1.
- `make up` - this will bring the Django service and React app up.

Run these commands in separate terminal.
- `make open-admin` - this will open the Django admin page in your browser.
- `make open-app` - this will open the React app in your browser.
