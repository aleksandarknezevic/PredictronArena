-include .env

.PHONY: all test clean help install update build test snapshot format

all: clean install update build test snapshot format

clean  :; forge clean

install :; forge install openzeppelin/openzeppelin-contracts@v5.4.0 && forge install smartcontractkit/chainlink-brownie-contracts@1.3.0

update:; forge update

build:; forge build

test :; forge test

snapshot :; forge snapshot

format :; forge fmt

